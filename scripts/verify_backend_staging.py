#!/usr/bin/env python3
"""Bounded public accreditation for the OCI staging backend."""
from __future__ import annotations

import argparse
import json
import time
import urllib.error
import urllib.parse
import urllib.request


def validate_sha(value: str) -> str:
    normalized = value.strip().lower()
    if len(normalized) != 40 or any(ch not in "0123456789abcdef" for ch in normalized):
        raise SystemExit("invalid expected SHA")
    return normalized


def fetch_json(url: str) -> tuple[int, dict]:
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "Cache-Control": "no-cache, no-store",
            "Pragma": "no-cache",
            "User-Agent": "chess-studio-staging-deploy/5",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as response:
            raw = response.read()
            try:
                body = json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                body = {}
            return response.status, body if isinstance(body, dict) else {}
    except urllib.error.HTTPError as exc:
        return exc.code, {}
    except (urllib.error.URLError, TimeoutError):
        return 0, {}


def self_test() -> None:
    sample = "0123456789abcdef0123456789abcdef01234567"
    assert validate_sha(sample) == sample
    assert validate_sha(sample.upper()) == sample
    for invalid in ("main", "", "g" * 40, sample[:-1]):
        try:
            validate_sha(invalid)
        except SystemExit:
            pass
        else:
            raise AssertionError(f"invalid SHA accepted: {invalid!r}")
    query = urllib.parse.urlencode({"sha": sample, "probe": 123})
    assert f"sha={sample}" in query and "probe=123" in query
    print("verify-backend-staging self-test OK")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-url")
    parser.add_argument("--sha")
    parser.add_argument("--attempts", type=int, default=20)
    parser.add_argument("--interval", type=float, default=2.0)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        self_test()
        return
    if not args.api_url or not args.sha:
        parser.error("--api-url and --sha are required unless --self-test is used")
    if args.attempts < 1:
        parser.error("--attempts must be >= 1")
    if args.interval < 0:
        parser.error("--interval must be >= 0")

    expected = validate_sha(args.sha)
    base = args.api_url.rstrip("/")
    last_signature: tuple[int, str, int, str] | None = None
    stable_wrong_build = 0

    for attempt in range(1, args.attempts + 1):
        probe = time.time_ns()
        ready_query = urllib.parse.urlencode({"probe": probe})
        release_query = urllib.parse.urlencode({"sha": expected, "probe": probe})
        ready_status, ready = fetch_json(f"{base}/ready?{ready_query}")
        release_status, release = fetch_json(f"{base}/release?{release_query}")
        storage = str(ready.get("storage") or "")
        observed = str(release.get("build") or "").lower()
        ok = ready_status == 200 and ready.get("ok") is True and storage == "mongo"
        exact = release_status == 200 and observed == expected
        if ok and exact:
            print(f"OCI staging public accreditation OK: storage=mongo build={observed}")
            return

        signature = (ready_status, storage, release_status, observed)
        if signature == last_signature and observed and observed != expected:
            stable_wrong_build += 1
        else:
            stable_wrong_build = 0
        last_signature = signature
        print(
            "OCI staging public accreditation pending: "
            f"ready_http={ready_status or 'error'} storage={storage or '<empty>'} "
            f"release_http={release_status or 'error'} observed_build={observed or '<empty>'} "
            f"expected_build={expected} attempt={attempt}/{args.attempts}"
        )

        # Five identical healthy observations of the same wrong immutable build
        # point to a stale/wrong public origin, not normal process startup.
        if ok and stable_wrong_build >= 4:
            raise SystemExit(
                f"public path is stably serving the wrong build: observed={observed} expected={expected}"
            )
        if attempt < args.attempts:
            time.sleep(args.interval)

    raise SystemExit(
        "public OCI staging did not converge to Mongo-ready exact build within bounded verification"
    )


if __name__ == "__main__":
    main()
