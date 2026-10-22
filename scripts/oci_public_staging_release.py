#!/usr/bin/env python3
"""Read-only public staging release probe; print only a validated SHA.

This is diagnostic context, never OCI host provenance or deploy accreditation.
No environment secrets, response bodies, headers or exception text are logged.
"""
from __future__ import annotations

import argparse
import json
import re
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

STAGING_RELEASE = "https://api-staging.chess-studio.shadowops.dpdns.org/api/release"
SHA = re.compile(r"[0-9a-f]{40}")


def validated_build(payload: bytes) -> str:
    try:
        document = json.loads(payload.decode("utf-8"))
        build = document.get("build", "") if isinstance(document, dict) else ""
        value = str(build).lower()
        return value if SHA.fullmatch(value) else "unavailable"
    except (UnicodeError, ValueError, TypeError):
        return "unavailable"


def read_public_release(expected: str) -> tuple[str, str]:
    request = Request(
        STAGING_RELEASE + "?sha=" + expected,
        headers={"Accept": "application/json", "Cache-Control": "no-cache"},
    )
    try:
        with urlopen(request, timeout=8) as response:
            status = str(response.status)
            body = response.read(4096)
            build = validated_build(body) if status == "200" else "unavailable"
            return status, build
    except HTTPError as exc:
        return str(exc.code), "unavailable"
    except (URLError, TimeoutError, OSError):
        return "unavailable", "unavailable"


def self_test() -> None:
    good = "a" * 40
    assert validated_build(json.dumps({"build": good}).encode()) == good
    assert validated_build(json.dumps({"build": good.upper()}).encode()) == good
    for value in (b"", b"not-json", b"[]", b'{"build":"main"}',
                  b'{"build":1234}', b'{"token":"must-never-print"}'):
        assert validated_build(value) == "unavailable"
    assert STAGING_RELEASE.startswith("https://")
    assert SHA.fullmatch(good) and not SHA.fullmatch("main")
    print("OCI public staging release probe self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--expected-sha")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    if not args.expected_sha or not SHA.fullmatch(args.expected_sha.lower()):
        parser.error("--expected-sha must be a complete 40-hex revision")
    expected = args.expected_sha.lower()
    status, build = read_public_release(expected)
    match = "yes" if status == "200" and build == expected else "no"
    print(f"OCI_PUBLIC_RELEASE status={status} build={build} expected_match={match}")
    # Observation must never convert an OCI failure into a success; the
    # original host probe and the existing staging accreditation retain authority.
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
