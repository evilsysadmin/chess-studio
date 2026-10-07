#!/usr/bin/env python3
"""Conservative garbage collection for Chess Studio's public Cloudflare R2 bucket.

The collector is intentionally fail-closed:
- runtime/manifest pins and stable ``current.*`` aliases are never deleted;
- young or unclassifiable objects are retained;
- only explicit ephemeral/deprecated prefixes, duplicate content-addressed blobs,
  bounded revision history, old immutable versions, and capacity-pressure
  rollback copies are eligible;
- deletion is rate-limited per run by object count and bucket fraction.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from typing import Any

import r2_asset_publisher as core

ROOT = pathlib.Path(__file__).resolve().parents[1]
HASHED_OBJECT_RE = re.compile(r"-([0-9a-f]{16})(?=\\.[A-Za-z0-9]+$)")
R2_URL_KEY_RE = re.compile(r"([A-Za-z0-9._/-]+)")
PIN_SUFFIXES = {
    ".css",
    ".gd",
    ".html",
    ".js",
    ".json",
    ".jsx",
    ".mjs",
    ".py",
    ".ts",
    ".tsx",
}
PIN_ROOTS = (
    ROOT / "frontend",
    ROOT / "games",
    ROOT / "backend-python",
    ROOT / "backend-go",
    ROOT / "workers",
)
REASON_PRIORITY = {
    "ephemeral-expired": 0,
    "deprecated-prefix": 1,
    "duplicate-content": 2,
    "stale-staging-revision": 3,
    "stale-runtime-revision": 4,
    "obsolete-version": 5,
    "capacity-pressure": 6,
}


class RetentionError(RuntimeError):
    pass


def _positive_int(policy: dict[str, Any], name: str, *, minimum: int = 0) -> int:
    value = policy.get(name)
    if not isinstance(value, int) or value < minimum:
        raise RetentionError(f"retention.{name} debe ser entero >= {minimum}")
    return value


def load_policy(config: dict[str, Any]) -> dict[str, Any]:
    policy = config.get("retention")
    if not isinstance(policy, dict) or policy.get("enabled") is not True:
        raise RetentionError("infra/cloudflare/r2-assets.json debe habilitar retention.enabled=true")

    target = _positive_int(policy, "targetBytes", minimum=1)
    soft = _positive_int(policy, "softLimitBytes", minimum=1)
    if target >= soft:
        raise RetentionError("retention.targetBytes debe ser menor que retention.softLimitBytes")

    _positive_int(policy, "minimumAgeDays", minimum=1)
    _positive_int(policy, "ephemeralMaxAgeDays", minimum=1)
    _positive_int(policy, "keepRollbackPerFamily")
    _positive_int(policy, "keepStagingRevisions")
    _positive_int(policy, "keepRuntimeRevisions")
    _positive_int(policy, "maxDeleteObjectsPerRun", minimum=1)

    fraction = policy.get("maxDeleteFractionPerRun")
    if not isinstance(fraction, (int, float)) or not 0 < float(fraction) <= 1:
        raise RetentionError("retention.maxDeleteFractionPerRun debe estar en (0, 1]")

    for name in ("ephemeralPrefixes", "deprecatedPrefixes", "protectedPrefixes"):
        values = policy.get(name, [])
        if not isinstance(values, list) or not all(
            isinstance(item, str) and item and not item.startswith("/") for item in values
        ):
            raise RetentionError(f"retention.{name} debe ser una lista de prefijos relativos")
    return policy


def object_collection_path(account_id: str, bucket: str) -> str:
    quoted_bucket = urllib.parse.quote(bucket, safe="")
    return f"/accounts/{account_id}/r2/buckets/{quoted_bucket}/objects"


def list_objects(token: str, account_id: str, bucket: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    cursor: str | None = None
    while True:
        query = {"per_page": "1000"}
        if cursor:
            query["cursor"] = cursor
        url = core.API_BASE + object_collection_path(account_id, bucket) + "?" + urllib.parse.urlencode(query)
        request = urllib.request.Request(
            url,
            method="GET",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/json",
                "User-Agent": "chess-studio-r2-retention/1",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                payload = core.decode_json(response.read())
        except urllib.error.HTTPError as exc:
            raise RetentionError(
                f"Cloudflare list objects HTTP {exc.code}: {core.decode_json(exc.read())}"
            ) from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise RetentionError(f"Cloudflare list objects no accesible: {exc}") from exc

        if not isinstance(payload, dict) or payload.get("success") is False:
            raise RetentionError(f"Cloudflare rechazó list objects: {payload!r}")
        page = payload.get("result")
        if not isinstance(page, list):
            raise RetentionError("Cloudflare list objects devolvió result no-list")
        rows.extend(item for item in page if isinstance(item, dict))

        info = payload.get("result_info")
        if not isinstance(info, dict) or not info.get("is_truncated"):
            break
        cursor = info.get("cursor")
        if not isinstance(cursor, str) or not cursor:
            raise RetentionError("Cloudflare marcó inventario truncado sin cursor")
    return rows


def parse_timestamp(value: Any) -> dt.datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = dt.datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return parsed.astimezone(dt.timezone.utc)


def normalize_inventory(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    inventory: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in rows:
        key = row.get("key")
        size = row.get("size")
        modified = parse_timestamp(row.get("last_modified"))
        if not isinstance(key, str) or not key or key.startswith("/") or key in seen:
            continue
        if not isinstance(size, int) or size < 0:
            continue
        seen.add(key)
        inventory.append(
            {
                "key": key,
                "size": size,
                "last_modified": modified,
                "etag": row.get("etag") if isinstance(row.get("etag"), str) else None,
            }
        )
    return inventory


def collect_repo_pins(base_url: str) -> set[str]:
    """Protect hard-coded runtime R2 URLs outside docs."""
    prefix = base_url.rstrip("/") + "/"
    pins: set[str] = set()
    for root in PIN_ROOTS:
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in PIN_SUFFIXES:
                continue
            try:
                if path.stat().st_size > 2 * 1024 * 1024:
                    continue
                text = path.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError):
                continue
            start = 0
            while True:
                index = text.find(prefix, start)
                if index < 0:
                    break
                match = R2_URL_KEY_RE.match(text, index + len(prefix))
                if match:
                    pins.add(match.group(1))
                    start = match.end()
                else:
                    start = index + len(prefix)
    return pins


def sha_token(key: str) -> str | None:
    match = HASHED_OBJECT_RE.search(key)
    return match.group(1) if match else None


def is_revision(key: str) -> bool:
    return "/revisions/" in key


def family_for(key: str) -> str:
    if "/revisions/" in key:
        return key.split("/revisions/", 1)[0] + "/revisions"
    return key.rsplit("/", 1)[0] if "/" in key else ""


def _age_days(item: dict[str, Any], now: dt.datetime) -> float | None:
    modified = item.get("last_modified")
    if not isinstance(modified, dt.datetime):
        return None
    return max(0.0, (now - modified).total_seconds() / 86400.0)


def _starts_with_any(key: str, prefixes: list[str]) -> bool:
    return any(key.startswith(prefix) for prefix in prefixes)


def _is_current_alias(key: str) -> bool:
    name = key.rsplit("/", 1)[-1]
    return name.startswith("current.") and len(name) > len("current.")


def plan_cleanup(
    rows: list[dict[str, Any]],
    *,
    manifest_keys: set[str],
    repo_pins: set[str],
    policy: dict[str, Any],
    now: dt.datetime | None = None,
) -> dict[str, Any]:
    now = (now or dt.datetime.now(dt.timezone.utc)).astimezone(dt.timezone.utc)
    inventory = normalize_inventory(rows)
    by_key = {item["key"]: item for item in inventory}
    total_bytes = sum(item["size"] for item in inventory)

    protected_prefixes = list(policy.get("protectedPrefixes", []))
    protected: dict[str, str] = {}
    for key in by_key:
        if key in manifest_keys:
            protected[key] = "manifest"
        elif key in repo_pins:
            protected[key] = "runtime-pin"
        elif _is_current_alias(key):
            protected[key] = "current-alias"
        elif _starts_with_any(key, protected_prefixes):
            protected[key] = "protected-prefix"

    minimum_age = int(policy["minimumAgeDays"])
    ephemeral_age = int(policy["ephemeralMaxAgeDays"])
    ephemeral_prefixes = list(policy.get("ephemeralPrefixes", []))
    deprecated_prefixes = list(policy.get("deprecatedPrefixes", []))
    reasons: dict[str, str] = {}

    def old_enough(item: dict[str, Any], days: int = minimum_age) -> bool:
        age = _age_days(item, now)
        return age is not None and age >= days

    def mark(key: str, reason: str) -> None:
        if key in protected or key in reasons:
            return
        reasons[key] = reason

    for item in inventory:
        key = item["key"]
        if _starts_with_any(key, ephemeral_prefixes) and old_enough(item, ephemeral_age):
            mark(key, "ephemeral-expired")
        elif _starts_with_any(key, deprecated_prefixes) and old_enough(item):
            mark(key, "deprecated-prefix")

    token_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in inventory:
        token = sha_token(item["key"])
        if token:
            token_groups[token].append(item)
    for group in token_groups.values():
        if len(group) < 2:
            continue
        pinned = [item for item in group if item["key"] in protected]
        candidates = sorted(
            (item for item in group if item["key"] not in protected),
            key=lambda item: item["last_modified"] or dt.datetime.min.replace(tzinfo=dt.timezone.utc),
            reverse=True,
        )
        keep = 0 if pinned else 1
        for item in candidates[keep:]:
            if old_enough(item):
                mark(item["key"], "duplicate-content")

    revision_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in inventory:
        if is_revision(item["key"]) and item["key"] not in protected:
            revision_groups[family_for(item["key"])].append(item)
    for family, group in revision_groups.items():
        keep = (
            int(policy["keepStagingRevisions"])
            if "/staging/revisions" in family
            else int(policy["keepRuntimeRevisions"])
        )
        ordered = sorted(
            group,
            key=lambda item: item["last_modified"] or dt.datetime.min.replace(tzinfo=dt.timezone.utc),
            reverse=True,
        )
        for item in ordered[keep:]:
            if old_enough(item):
                reason = "stale-staging-revision" if "/staging/revisions" in family else "stale-runtime-revision"
                mark(item["key"], reason)

    hashed_families: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in inventory:
        key = item["key"]
        if sha_token(key) and not is_revision(key) and key not in protected:
            hashed_families[family_for(key)].append(item)
    rollback_keep = int(policy["keepRollbackPerFamily"])
    for group in hashed_families.values():
        ordered = sorted(
            group,
            key=lambda item: item["last_modified"] or dt.datetime.min.replace(tzinfo=dt.timezone.utc),
            reverse=True,
        )
        keep = max(1, rollback_keep)
        for item in ordered[keep:]:
            if old_enough(item):
                mark(item["key"], "obsolete-version")

    planned_bytes = sum(by_key[key]["size"] for key in reasons)
    projected_after_policy = total_bytes - planned_bytes
    if projected_after_policy > int(policy["softLimitBytes"]):
        pressure_candidates = [
            item
            for item in inventory
            if item["key"] not in protected
            and item["key"] not in reasons
            and old_enough(item)
            and (sha_token(item["key"]) or is_revision(item["key"]))
        ]
        pressure_candidates.sort(
            key=lambda item: item["last_modified"] or dt.datetime.min.replace(tzinfo=dt.timezone.utc)
        )
        for item in pressure_candidates:
            if projected_after_policy <= int(policy["targetBytes"]):
                break
            mark(item["key"], "capacity-pressure")
            projected_after_policy -= item["size"]

    all_candidates = [
        {
            "key": key,
            "bytes": by_key[key]["size"],
            "lastModified": (
                by_key[key]["last_modified"].isoformat()
                if isinstance(by_key[key]["last_modified"], dt.datetime)
                else None
            ),
            "reason": reason,
        }
        for key, reason in reasons.items()
    ]
    all_candidates.sort(
        key=lambda item: (
            REASON_PRIORITY.get(item["reason"], 99),
            item["lastModified"] or "",
            item["key"],
        )
    )

    max_objects = int(policy["maxDeleteObjectsPerRun"])
    max_bytes = int(total_bytes * float(policy["maxDeleteFractionPerRun"]))
    selected: list[dict[str, Any]] = []
    selected_bytes = 0
    for item in all_candidates:
        if len(selected) >= max_objects:
            break
        if selected and selected_bytes + item["bytes"] > max_bytes:
            continue
        selected.append(item)
        selected_bytes += item["bytes"]

    truncated = len(selected) < len(all_candidates)
    projected_bytes = total_bytes - selected_bytes
    blocked_over_soft = projected_bytes > int(policy["softLimitBytes"]) and not truncated

    return {
        "version": 1,
        "generatedAt": now.isoformat(),
        "totalObjects": len(inventory),
        "totalBytes": total_bytes,
        "protectedObjects": len(protected),
        "candidateObjects": len(all_candidates),
        "candidateBytes": sum(item["bytes"] for item in all_candidates),
        "deleteObjects": len(selected),
        "deleteBytes": selected_bytes,
        "projectedBytes": projected_bytes,
        "softLimitBytes": int(policy["softLimitBytes"]),
        "targetBytes": int(policy["targetBytes"]),
        "truncatedByGuard": truncated,
        "blockedOverSoftLimit": blocked_over_soft,
        "deletions": selected,
    }


def write_report(path: pathlib.Path | None, report: dict[str, Any]) -> None:
    rendered = json.dumps(report, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    if path is not None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(rendered, encoding="utf-8")
    print(rendered, end="")


def apply_plan(
    report: dict[str, Any],
    *,
    token: str,
    account_id: str,
    bucket: str,
) -> None:
    for item in report["deletions"]:
        key = item["key"]
        core.delete_object(token, account_id, bucket, key)
        print(f"DELETED {key} ({item['bytes']} bytes; {item['reason']})", file=sys.stderr)


def run_remote(
    command: str,
    config_path: pathlib.Path,
    manifest_path: pathlib.Path,
    report_path: pathlib.Path | None,
) -> int:
    config = core.load_config(config_path)
    policy = load_policy(config)
    base_url = f"https://{config['customDomain']}"
    manifest = core.load_manifest(manifest_path, base_url)
    manifest_keys = {
        entry["key"]
        for entry in manifest["assets"].values()
        if isinstance(entry, dict) and isinstance(entry.get("key"), str)
    }
    repo_pins = collect_repo_pins(base_url)
    token, account_id = core.require_env()
    rows = list_objects(token, account_id, config["bucket"])
    report = plan_cleanup(
        rows,
        manifest_keys=manifest_keys,
        repo_pins=repo_pins,
        policy=policy,
    )
    write_report(report_path, report)

    if command == "apply" and report["deletions"]:
        apply_plan(report, token=token, account_id=account_id, bucket=config["bucket"])

    if report["blockedOverSoftLimit"]:
        print(
            "ERROR: R2 sigue sobre el soft limit y no quedan candidatos seguros automáticos; "
            "requiere revisión explícita.",
            file=sys.stderr,
        )
        return 2
    if report["projectedBytes"] > report["softLimitBytes"]:
        print(
            "WARN: R2 seguirá temporalmente sobre el soft limit por los guardrails; "
            "la siguiente ejecución continuará la poda.",
            file=sys.stderr,
        )
    return 0


def self_test() -> None:
    now = dt.datetime(2026, 10, 7, tzinfo=dt.timezone.utc)

    def row(key: str, size: int, age_days: int) -> dict[str, Any]:
        modified = now - dt.timedelta(days=age_days)
        return {
            "key": key,
            "size": size,
            "last_modified": modified.isoformat().replace("+00:00", "Z"),
            "etag": key,
        }

    policy = {
        "enabled": True,
        "targetBytes": 8_000,
        "softLimitBytes": 8_500,
        "minimumAgeDays": 14,
        "ephemeralMaxAgeDays": 1,
        "keepRollbackPerFamily": 1,
        "keepStagingRevisions": 1,
        "keepRuntimeRevisions": 2,
        "maxDeleteObjectsPerRun": 1000,
        "maxDeleteFractionPerRun": 1.0,
        "ephemeralPrefixes": ["_smoke/"],
        "deprecatedPrefixes": ["deprecated/"],
        "protectedPrefixes": [],
    }
    load_policy({"retention": policy})
    rows = [
        row("scene/runtime/scene-aaaaaaaaaaaaaaaa.glb", 100, 2),
        row("scene/runtime/scene-bbbbbbbbbbbbbbbb.glb", 100, 30),
        row("scene/runtime/scene-cccccccccccccccc.glb", 100, 60),
        row("copy/runtime/scene-aaaaaaaaaaaaaaaa.glb", 100, 30),
        row("room/runtime/current.glb", 100, 90),
        row("room/staging/revisions/sha-new.glb", 100, 20),
        row("room/staging/revisions/sha-old.glb", 100, 40),
        row("room/runtime/revisions/sha-1.glb", 100, 20),
        row("room/runtime/revisions/sha-2.glb", 100, 30),
        row("room/runtime/revisions/sha-3.glb", 100, 40),
        row("_smoke/orphan.txt", 10, 2),
        row("deprecated/atlas-old.webp", 100, 30),
        row("young/runtime/young-dddddddddddddddd.glb", 100, 2),
    ]
    report = plan_cleanup(
        rows,
        manifest_keys={"scene/runtime/scene-aaaaaaaaaaaaaaaa.glb"},
        repo_pins=set(),
        policy=policy,
        now=now,
    )
    reasons = {item["key"]: item["reason"] for item in report["deletions"]}
    assert reasons["copy/runtime/scene-aaaaaaaaaaaaaaaa.glb"] == "duplicate-content"
    assert reasons["scene/runtime/scene-cccccccccccccccc.glb"] == "obsolete-version"
    assert "scene/runtime/scene-bbbbbbbbbbbbbbbb.glb" not in reasons
    assert reasons["room/staging/revisions/sha-old.glb"] == "stale-staging-revision"
    assert reasons["room/runtime/revisions/sha-3.glb"] == "stale-runtime-revision"
    assert reasons["_smoke/orphan.txt"] == "ephemeral-expired"
    assert reasons["deprecated/atlas-old.webp"] == "deprecated-prefix"
    assert "room/runtime/current.glb" not in reasons
    assert "young/runtime/young-dddddddddddddddd.glb" not in reasons
    print("OK r2 retention self-test")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("plan", "apply"):
        command = sub.add_parser(name)
        command.add_argument("--config", type=pathlib.Path, default=core.DEFAULT_CONFIG)
        command.add_argument("--manifest", type=pathlib.Path, default=core.DEFAULT_MANIFEST)
        command.add_argument("--report", type=pathlib.Path)
    sub.add_parser("self-test")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        if args.command == "self-test":
            self_test()
            return 0
        return run_remote(args.command, args.config, args.manifest, args.report)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
