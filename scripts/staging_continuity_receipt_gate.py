#!/usr/bin/env python3
"""Fail closed on a missing OCI host receipt in the staging continuity drill."""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path
from typing import Callable

STAGING_API = "https://api-staging.chess-studio.shadowops.dpdns.org/api"


def require_proof(deploy_rc: int, probe_rc: int, public_attest: Callable[[], None]) -> str:
    if probe_rc != 0:
        raise ValueError(f"game/PvP continuity probe failed (rc={probe_rc})")
    if deploy_rc == 0:
        return "host"
    if deploy_rc != 78:
        raise ValueError(f"OCI deploy failed or superseded (rc={deploy_rc})")
    public_attest()
    return "public"


def verify_public_staging(api_url: str, sha: str) -> None:
    if api_url.rstrip("/") != STAGING_API:
        raise ValueError("refusing non-staging URL for provisional receipt")
    if re.fullmatch(r"[0-9a-f]{40}", sha) is None:
        raise ValueError("invalid exact SHA")
    subprocess.run(
        [
            sys.executable, "-S", str(Path(__file__).with_name("verify_backend_staging.py")),
            "--api-url", api_url, "--sha", sha, "--attempts", "10", "--interval", "2",
        ],
        check=True,
    )


def self_test() -> None:
    calls: list[int] = []
    def attest() -> None:
        calls.append(1)
    assert require_proof(0, 0, attest) == "host" and calls == []
    assert require_proof(78, 0, attest) == "public" and calls == [1]
    for deploy, probe in ((0, 1), (78, 1), (1, 0), (86, 0), (87, 0)):
        try:
            require_proof(deploy, probe, attest)
        except ValueError:
            pass
        else:
            raise AssertionError(f"unverified status accepted: {deploy=}, {probe=}")
    assert calls == [1]
    def fail_public() -> None:
        raise ValueError("public API unavailable")
    try:
        require_proof(78, 0, fail_public)
    except ValueError:
        pass
    else:
        raise AssertionError("unverified public proof accepted")
    for api, sha in ((STAGING_API, "main"), ("https://example.invalid/api", "a" * 40)):
        try:
            verify_public_staging(api, sha)
        except ValueError:
            pass
        else:
            raise AssertionError("invalid public proof input accepted")
    print("staging continuity receipt gate self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("deploy_rc", nargs="?", type=int)
    parser.add_argument("probe_rc", nargs="?", type=int)
    parser.add_argument("api_url", nargs="?")
    parser.add_argument("sha", nargs="?")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    if None in (args.deploy_rc, args.probe_rc, args.api_url, args.sha):
        parser.error("expected deploy_rc probe_rc api_url sha")
    try:
        proof = require_proof(args.deploy_rc, args.probe_rc,
                              lambda: verify_public_staging(args.api_url, args.sha))
    except (ValueError, subprocess.CalledProcessError) as exc:
        print(f"::error::continuity receipt gate rejected deployment: {exc}", file=sys.stderr)
        return 1
    if proof == "public":
        print("::warning::OCI host receipt absent; public exact-SHA attested", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
