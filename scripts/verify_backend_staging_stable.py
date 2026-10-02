#!/usr/bin/env python3
"""Require a short stable window of exact public staging accreditation."""
from __future__ import annotations

import argparse
import pathlib
import subprocess
import sys
import time


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-url", required=True)
    parser.add_argument("--sha", required=True)
    parser.add_argument("--samples", type=int, default=4)
    parser.add_argument("--interval", type=float, default=5.0)
    args = parser.parse_args()
    if args.samples < 1 or args.interval < 0:
        parser.error("samples must be >= 1 and interval >= 0")

    verifier = pathlib.Path(__file__).with_name("verify_backend_staging.py")
    command = [
        sys.executable,
        str(verifier),
        "--api-url",
        args.api_url,
        "--sha",
        args.sha,
        "--attempts",
        "1",
        "--interval",
        "0",
    ]
    for sample in range(args.samples):
        if sample:
            time.sleep(args.interval)
        if subprocess.run(
            command,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        ).returncode != 0:
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
