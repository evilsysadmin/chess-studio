#!/usr/bin/env python3
"""Shared main-lineage inspector for staging and production release workflows.

The release contract is intentionally small: an accredited SHA remains eligible
when GitHub compares it to current main as either ``identical`` or ``ahead``.
Anything else means the SHA is no longer in main's ancestry and callers must
stop before emitting accreditation or mutating production.
"""
from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

SHA_RE = re.compile(r"[0-9a-f]{40}")
IN_LINEAGE_STATUSES = frozenset({"identical", "ahead"})


@dataclass(frozen=True)
class Lineage:
    deploy_sha: str
    current_main: str
    compare_status: str

    @property
    def in_main_lineage(self) -> bool:
        return self.compare_status in IN_LINEAGE_STATUSES


def normalize_sha(value: str, *, label: str) -> str:
    sha = value.strip().lower()
    if SHA_RE.fullmatch(sha) is None:
        raise ValueError(f"{label} inválido: {value!r}")
    return sha


def parse_current_main(output: str) -> str:
    rows = [line.split() for line in output.splitlines() if line.strip()]
    if len(rows) != 1 or len(rows[0]) < 2 or rows[0][1] != "refs/heads/main":
        raise ValueError(f"respuesta inesperada de git ls-remote para main: {output!r}")
    return normalize_sha(rows[0][0], label="current main SHA")


def normalize_compare_status(value: str) -> str:
    status = value.strip().lower()
    if not status or re.fullmatch(r"[a-z_]+", status) is None:
        raise ValueError(f"compare status inválido: {value!r}")
    return status


def run_checked(command: list[str]) -> str:
    completed = subprocess.run(
        command,
        check=True,
        capture_output=True,
        text=True,
    )
    return completed.stdout


def inspect_lineage(deploy_sha: str, repository: str) -> Lineage:
    sha = normalize_sha(deploy_sha, label="DEPLOY_SHA")
    if not repository or "/" not in repository:
        raise ValueError(f"GITHUB_REPOSITORY inválido: {repository!r}")

    current_main = parse_current_main(
        run_checked(["git", "ls-remote", "--exit-code", "origin", "refs/heads/main"])
    )
    compare_status = normalize_compare_status(
        run_checked(
            [
                "gh",
                "api",
                "-H",
                "Accept: application/vnd.github+json",
                f"/repos/{repository}/compare/{sha}...{current_main}",
                "--jq",
                ".status",
            ]
        )
    )
    return Lineage(sha, current_main, compare_status)


def write_env(path: Path, lineage: Lineage) -> None:
    path.write_text(
        "\n".join(
            (
                f"DEPLOY_SHA={lineage.deploy_sha}",
                f"CURRENT_MAIN={lineage.current_main}",
                f"COMPARE_STATUS={lineage.compare_status}",
                f"IN_MAIN_LINEAGE={'true' if lineage.in_main_lineage else 'false'}",
                "",
            )
        ),
        encoding="utf-8",
    )


def self_test() -> None:
    sha = "a" * 40
    main = "b" * 40
    assert normalize_sha(sha.upper(), label="test") == sha
    assert parse_current_main(f"{main}\trefs/heads/main\n") == main
    assert normalize_compare_status("ahead\n") == "ahead"
    assert Lineage(sha, main, "identical").in_main_lineage
    assert Lineage(sha, main, "ahead").in_main_lineage
    assert not Lineage(sha, main, "behind").in_main_lineage
    assert not Lineage(sha, main, "diverged").in_main_lineage

    for bad in ("", "abc", "g" * 40):
        try:
            normalize_sha(bad, label="test")
        except ValueError:
            pass
        else:
            raise AssertionError(f"invalid SHA accepted: {bad!r}")

    with tempfile.TemporaryDirectory() as tmp:
        target = Path(tmp) / "lineage.env"
        write_env(target, Lineage(sha, main, "ahead"))
        content = target.read_text(encoding="utf-8")
        assert f"DEPLOY_SHA={sha}" in content
        assert f"CURRENT_MAIN={main}" in content
        assert "COMPARE_STATUS=ahead" in content
        assert "IN_MAIN_LINEAGE=true" in content


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sha", help="accredited deployment SHA")
    parser.add_argument("--repository", default=os.environ.get("GITHUB_REPOSITORY", ""))
    parser.add_argument("--write-env", type=Path)
    parser.add_argument("--require-in-lineage", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args(argv)

    if args.self_test:
        self_test()
        print("main lineage guard self-test: OK")
        return 0

    if not args.sha:
        parser.error("--sha is required unless --self-test is used")

    try:
        lineage = inspect_lineage(args.sha, args.repository)
        if args.write_env:
            write_env(args.write_env, lineage)
    except (ValueError, subprocess.CalledProcessError, OSError) as exc:
        print(f"::error::main lineage inspection failed: {exc}", file=sys.stderr)
        return 2

    print(
        "main-lineage: "
        f"deploy={lineage.deploy_sha} current={lineage.current_main} "
        f"compare={lineage.compare_status} "
        f"in_lineage={'true' if lineage.in_main_lineage else 'false'}"
    )

    if args.require_in_lineage and not lineage.in_main_lineage:
        print(
            f"::error::El SHA acreditado {lineage.deploy_sha} ya no pertenece a la línea de "
            f"main {lineage.current_main} (compare={lineage.compare_status}).",
            file=sys.stderr,
        )
        return 3
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
