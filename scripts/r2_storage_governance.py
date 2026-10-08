#!/usr/bin/env python3
"""R2 storage governance: admission checks and daily actionable alerts.

Billable GB-months are distinct from live bucket bytes. We govern live bytes and
new publication peaks; we do not claim to forecast Cloudflare's invoice.
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import subprocess
import sys
from typing import Any

import r2_asset_publisher as publisher

ISSUE_TITLE = "[R2] Storage capacity warning"
GB = 1_000_000_000


def budget(config: dict[str, Any]) -> tuple[int, int]:
    retention = config["retention"]
    warning = retention.get("warningBytes")
    soft = retention.get("softLimitBytes")
    target = retention.get("targetBytes")
    if any(type(value) is not int or value <= 0 for value in (warning, soft, target)):
        raise ValueError("R2 retention: warningBytes, targetBytes and softLimitBytes must be positive integers")
    if not warning < target < soft < 10 * GB:
        raise ValueError("R2 retention: require warningBytes < targetBytes < softLimitBytes < 10 GB")
    return warning, soft


def status_for_report(report: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    warning, soft = budget(config)
    # A failed apply may only have an initial inventory. Never mistake an
    # optimistic projectedBytes for measured post-deletion footprint.
    actual = report.get("actualAfterBytes", report["totalBytes"])
    if type(actual) is not int or actual < 0:
        raise ValueError("R2 report lacks valid measured inventory bytes")
    return {
        "bytes": actual,
        "objects": report.get("actualAfterObjects", report.get("totalObjects", 0)),
        "warningBytes": warning,
        "softBytes": soft,
        "level": "critical" if actual >= soft else "warning" if actual >= warning else "ok",
        "protectedBytes": report.get("protectedBytes", 0),
        "deletedBytes": report.get("deleteBytes", 0) if "actualAfterBytes" in report else 0,
        "topPrefixes": report.get("topRetainedPrefixes", [])[:6],
        "truncated": report.get("truncatedByGuard", False),
    }


def admission_check_batch(config: dict[str, Any], *, token: str, account_id: str,
                          additions: dict[str, int]) -> None:
    """Preflight the full immutable release before the first PUT."""
    import r2_asset_gc as collector

    if not additions or any(not isinstance(key, str) or not key or type(size) is not int or size < 0
                            for key, size in additions.items()):
        raise publisher.PublishError("R2 admission: invalid planned objects")
    warning, soft = budget(config)
    rows = collector.list_objects(token, account_id, config["bucket"])
    inventory = collector.normalize_inventory(rows)
    if len(inventory) != len(rows):
        raise publisher.PublishError("R2 admission: incomplete/invalid inventory; refusing upload")
    sizes = {item["key"]: item["size"] for item in inventory}
    total = sum(sizes.values())
    projected = total + sum(size - sizes.get(key, 0) for key, size in additions.items())
    if projected > soft:
        if os.environ.get("R2_STORAGE_BUDGET_OVERRIDE") != "1":
            raise publisher.PublishError(
                f"R2 admission blocked: projected {projected / GB:.3f} GB > {soft / GB:.1f} GB "
                "soft ceiling. Clean up first; local emergency override requires "
                "R2_STORAGE_BUDGET_OVERRIDE=1."
            )
        print("WARN: explicit R2_STORAGE_BUDGET_OVERRIDE=1; daily peak may incur charges", file=sys.stderr)
    if projected >= warning:
        print(f"WARN: R2 projected {projected / GB:.3f} GB exceeds {warning / GB:.1f} GB early warning", file=sys.stderr)
    else:
        print(f"R2 admission OK: {total / GB:.3f} -> {projected / GB:.3f} GB", file=sys.stderr)


def admission_check(config: dict[str, Any], *, token: str, account_id: str,
                    key: str, size: int) -> None:
    admission_check_batch(config, token=token, account_id=account_id, additions={key: size})


def issue_body(status: dict[str, Any]) -> str:
    return (
        "Automated capacity alert from the scheduled R2 retention workflow.\n\n"
        f"- Measured storage: **{status['bytes'] / GB:.3f} GB** ({status['objects']} objects)\n"
        f"- Warning: {status['warningBytes'] / GB:.1f} GB; admission ceiling: "
        f"{status['softBytes'] / GB:.1f} GB\n"
        f"- Retention pass hit deletion guard: {status['truncated']}\n"
        f"- Protected: {status['protectedBytes'] / GB:.3f} GB\n\n"
        "Largest remaining prefixes:\n"
        + "".join(
            f"- `{item['prefix']}`: {item['bytes'] / GB:.3f} GB\n"
            for item in status["topPrefixes"]
        )
        + "\nCheck the retention audit artifact in GitHub Actions before manually deleting anything. "
        "Never delete the active manifest, current pointers or release rollback blindly.\n"
    )


def github_issue(status: dict[str, Any]) -> None:
    if not os.environ.get("GH_TOKEN") or not os.environ.get("GH_REPO"):
        raise RuntimeError("GH_TOKEN and GH_REPO are required to manage R2 capacity issue")

    def gh(*args: str) -> str:
        result = subprocess.run(["gh", "issue", *args], check=True, text=True, capture_output=True)
        return result.stdout.strip()

    issues = json.loads(gh("list", "--repo", os.environ["GH_REPO"], "--state", "open",
                           "--limit", "1000", "--json", "number,title"))
    existing = next((i["number"] for i in issues if i["title"] == ISSUE_TITLE), None)
    if status["level"] == "ok":
        if existing is not None:
            gh("close", str(existing), "--repo", os.environ["GH_REPO"],
               "--reason", "completed", "--comment", "Measured R2 storage fell below 5 GB.")
        return
    body = issue_body(status)
    if existing is None:
        gh("create", "--repo", os.environ["GH_REPO"], "--title", ISSUE_TITLE, "--body", body)
    else:
        gh("edit", str(existing), "--repo", os.environ["GH_REPO"], "--body", body)


def ci_report(report_path: pathlib.Path, config_path: pathlib.Path, issue: bool) -> int:
    report = json.loads(report_path.read_text(encoding="utf-8"))
    status = status_for_report(report, publisher.load_config(config_path))
    line = (f"Measured R2: {status['bytes'] / GB:.3f} GB / {status['objects']} objects "
            f"(warning {status['warningBytes'] / GB:.1f} GB, ceiling {status['softBytes'] / GB:.1f} GB)")
    print(line)
    if status["level"] != "ok":
        print(f"::warning title=R2 storage {status['level']}::{line}")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as output:
            output.write("\n### R2 storage governance\n\n")
            output.write(f"- Status: **{status['level']}** · {line}\n")
            output.write(f"- Protected: {status['protectedBytes'] / GB:.3f} GB; "
                         f"retention guard truncated: {status['truncated']}\n")
            output.write("- Billing GB-months are not the same as current storage bytes.\n")
            for item in status["topPrefixes"]:
                output.write(f"  - `{item['prefix']}`: {item['bytes'] / GB:.3f} GB\n")
    if issue:
        github_issue(status)
    if status["level"] == "critical":
        print(f"::error title=R2 ceiling exceeded::{line}")
        return 2
    return 0


def self_test() -> None:
    config = publisher.load_config(publisher.DEFAULT_CONFIG)
    assert budget(config) == (5 * GB, 7 * GB)
    for amount, expected in [(0, "ok"), (5 * GB - 1, "ok"), (5 * GB, "warning"),
                             (7 * GB - 1, "warning"), (7 * GB, "critical")]:
        status = status_for_report({"totalBytes": amount, "totalObjects": 1}, config)
        assert status["level"] == expected, (amount, status)
    measured = status_for_report({"totalBytes": 8 * GB, "actualAfterBytes": 3 * GB}, config)
    assert measured["level"] == "ok"
    assert "projected" not in issue_body(status_for_report({"totalBytes": 6 * GB}, config))
    # Admission tests use a fake inventory: no Cloudflare credentials/network.
    import r2_asset_gc as collector

    previous_list = collector.list_objects
    try:
        collector.list_objects = lambda *_args: [
            {"key": "scene-a.glb", "size": 6_900_000_000,
             "last_modified": "2026-10-08T00:00:00Z"}
        ]
        admission_check(config, token="test", account_id="test", key="scene-a.glb",
                        size=6_900_000_000)
        try:
            admission_check(config, token="test", account_id="test", key="scene-b.glb",
                            size=200_000_000)
        except publisher.PublishError as exc:
            assert "admission blocked" in str(exc)
        else:
            raise AssertionError("Over-budget upload must be denied")
        # A bundle must fail as a whole when individually small files exceed
        # the ceiling in aggregate; the pointer and files share one preflight.
        try:
            admission_check_batch(config, token="test", account_id="test",
                                  additions={"new/a.pck": 60_000_000,
                                             "new/b.wasm": 60_000_000})
        except publisher.PublishError as exc:
            assert "admission blocked" in str(exc)
        else:
            raise AssertionError("Over-budget Godot batch must be denied")
        collector.list_objects = lambda *_args: [{"key": "bad", "size": "unknown"}]
        try:
            admission_check(config, token="test", account_id="test",
                            key="scene-c.glb", size=100)
        except publisher.PublishError as exc:
            assert "incomplete/invalid" in str(exc)
        else:
            raise AssertionError("Invalid inventory must fail closed")
    finally:
        collector.list_objects = previous_list
    print("OK R2 storage governance self-test")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["self-test", "report"])
    parser.add_argument("--report", type=pathlib.Path)
    parser.add_argument("--config", type=pathlib.Path, default=publisher.DEFAULT_CONFIG)
    parser.add_argument("--issue", action="store_true")
    args = parser.parse_args()
    try:
        if args.command == "self-test":
            self_test()
            return 0
        if args.report is None:
            parser.error("--report is required")
        return ci_report(args.report, args.config, args.issue)
    except Exception as exc:
        print(f"ERROR R2 storage governance: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
