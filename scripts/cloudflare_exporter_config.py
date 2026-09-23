#!/usr/bin/env python3
"""Build the hardened Chess Studio config for the pinned Cloudflare exporter."""
from __future__ import annotations

import argparse
import copy
import json
import os
import tempfile
from pathlib import Path


def parse_jsonc_document(text: str) -> dict:
    try:
        start = text.index("{")
    except ValueError as exc:
        raise ValueError("wrangler.jsonc does not contain a JSON object") from exc
    payload = json.loads(text[start:])
    if not isinstance(payload, dict):
        raise ValueError("wrangler.jsonc root must be an object")
    return payload


def build_config(
    source: dict,
    *,
    exporter_name: str,
    exporter_hostname: str,
    account_id: str,
) -> dict:
    for label, value in (
        ("EXPORTER_NAME", exporter_name),
        ("EXPORTER_HOSTNAME", exporter_hostname),
        ("CLOUDFLARE_ACCOUNT_ID", account_id),
    ):
        if not value:
            raise ValueError(f"{label} must not be empty")

    cfg = copy.deepcopy(source)
    cfg["name"] = exporter_name
    cfg["workers_dev"] = False
    cfg["routes"] = [{"pattern": exporter_hostname, "custom_domain": True}]

    vars_cfg = dict(cfg.get("vars") or {})
    vars_cfg.pop("HOST_METRICS_ALLOWLIST", None)
    vars_cfg.pop("CF_HTTP_STATUS_GROUP", None)
    vars_cfg.update(
        {
            "CF_ACCOUNTS": account_id,
            "CF_FREE_TIER_ACCOUNTS": account_id,
            "DISABLE_UI": True,
            "DISABLE_CONFIG_API": True,
            "LOG_LEVEL": "info",
            "LOG_FORMAT": "json",
        }
    )
    cfg["vars"] = vars_cfg
    return cfg


def write_config(source_path: Path, output_path: Path) -> dict:
    source = parse_jsonc_document(source_path.read_text(encoding="utf-8"))
    cfg = build_config(
        source,
        exporter_name=os.environ.get("EXPORTER_NAME", ""),
        exporter_hostname=os.environ.get("EXPORTER_HOSTNAME", ""),
        account_id=os.environ.get("CLOUDFLARE_ACCOUNT_ID", ""),
    )
    output_path.write_text(json.dumps(cfg, indent=2) + "\n", encoding="utf-8")
    return cfg


def self_test() -> None:
    source = {
        "name": "upstream",
        "workers_dev": True,
        "routes": ["legacy.example"],
        "vars": {"KEEP_ME": "yes", "CF_FREE_TIER_ACCOUNTS": "old"},
    }
    cfg = build_config(
        source,
        exporter_name="chess-studio-cloudflare-prometheus",
        exporter_hostname="metrics.shadowops.dpdns.org",
        account_id="account-123",
    )
    assert source["name"] == "upstream"
    assert cfg["name"] == "chess-studio-cloudflare-prometheus"
    assert cfg["workers_dev"] is False
    assert cfg["routes"] == [
        {"pattern": "metrics.shadowops.dpdns.org", "custom_domain": True}
    ]
    assert cfg["vars"]["KEEP_ME"] == "yes"
    assert cfg["vars"]["CF_ACCOUNTS"] == "account-123"
    assert cfg["vars"]["CF_FREE_TIER_ACCOUNTS"] == "account-123"
    assert "HOST_METRICS_ALLOWLIST" not in cfg["vars"]
    assert "CF_HTTP_STATUS_GROUP" not in cfg["vars"]
    assert cfg["vars"]["DISABLE_UI"] is True
    assert cfg["vars"]["DISABLE_CONFIG_API"] is True

    parsed = parse_jsonc_document("// generated upstream\n" + json.dumps(source))
    assert parsed == source

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        source_path = root / "wrangler.jsonc"
        output_path = root / "wrangler.chess-studio.json"
        source_path.write_text("// header\n" + json.dumps(source), encoding="utf-8")
        previous = dict(os.environ)
        try:
            os.environ.update(
                {
                    "EXPORTER_NAME": "test-exporter",
                    "EXPORTER_HOSTNAME": "metrics.test",
                    "CLOUDFLARE_ACCOUNT_ID": "acct",
                }
            )
            written = write_config(source_path, output_path)
        finally:
            os.environ.clear()
            os.environ.update(previous)
        assert written["name"] == "test-exporter"
        assert json.loads(output_path.read_text(encoding="utf-8")) == written


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path("upstream-exporter"))
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        self_test()
        print("cloudflare exporter config self-test: OK")
        return 0

    source = args.root / "wrangler.jsonc"
    output = args.root / "wrangler.chess-studio.json"
    cfg = write_config(source, output)
    print(
        f"Exporter pinned={os.environ.get('EXPORTER_UPSTREAM_SHA', '<unknown>')} "
        f"name={cfg['name']} host={os.environ['EXPORTER_HOSTNAME']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
