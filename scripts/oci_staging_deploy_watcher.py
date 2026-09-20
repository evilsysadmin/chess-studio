#!/usr/bin/env python3
"""Zero-OCI-cost staging deploy watcher.

The watcher is deliberately outbound-only. It observes the already-existing
staging AI Worker build identity, then invokes the narrow root-owned immutable-SHA
deploy wrapper through sudo. The root-owned wrapper is the single authority for
revalidating GitHub main after acquiring the host mutation lock.

It never accepts inbound requests and it performs no OCI API calls.
"""
from __future__ import annotations

import argparse
import ast
import json
import os
import re
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

AI_HEALTH_URL = os.environ.get(
    "CHESS_STUDIO_STAGING_AI_HEALTH_URL",
    "https://ai-staging.shadowops.dpdns.org/health",
).strip()
STATE_FILE = Path(os.environ.get("CHESS_STUDIO_STATE_FILE", "/var/lib/chess-studio/deployed.sha"))
ENABLE_MARKER = Path(
    os.environ.get("CHESS_STUDIO_DEPLOY_WATCH_MARKER", "/var/lib/chess-studio/DEPLOY_WATCH_ENABLED")
)
DEPLOY_WRAPPER = os.environ.get(
    "CHESS_STUDIO_DEPLOY_WRAPPER",
    "/usr/local/sbin/chess-studio-deploy",
).strip()
POLL_SECONDS = 15
ERROR_BACKOFF_SECONDS = 30
HTTP_TIMEOUT_SECONDS = 8
DEPLOY_TIMEOUT_SECONDS = 900
SHA_RE = re.compile(r"^[0-9a-f]{40}$")
USER_AGENT = "chess-studio-staging-deploy-watcher/1"


def valid_sha(value: object) -> str:
    text = str(value or "").strip().lower()
    return text if SHA_RE.fullmatch(text) else ""


def build_from_health_payload(payload: object) -> str:
    if not isinstance(payload, dict):
        return ""
    return valid_sha(payload.get("build"))


def read_deployed_sha() -> str:
    try:
        return valid_sha(STATE_FILE.read_text(encoding="utf-8"))
    except OSError:
        return ""


def fetch_worker_build() -> str:
    request = urllib.request.Request(
        AI_HEALTH_URL,
        headers={
            "Accept": "application/json",
            "Cache-Control": "no-cache",
            "User-Agent": USER_AGENT,
        },
    )
    with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
        if response.status != 200:
            raise RuntimeError(f"Worker health HTTP {response.status}")
        payload = json.loads(response.read())
    build = build_from_health_payload(payload)
    if not build:
        raise RuntimeError("Worker health omitted a valid immutable build SHA")
    return build



def deploy(candidate: str) -> None:
    subprocess.run(
        ["sudo", "--non-interactive", DEPLOY_WRAPPER, candidate],
        check=True,
        timeout=DEPLOY_TIMEOUT_SECONDS,
    )


def iteration() -> str:
    if not ENABLE_MARKER.is_file() or ENABLE_MARKER.is_symlink():
        return "disabled"

    candidate = fetch_worker_build()
    if candidate == read_deployed_sha():
        return "current"

    print(f"OCI_DEPLOY_WATCH_TRIGGER repo_ref={candidate}", flush=True)
    deploy(candidate)
    deployed = read_deployed_sha()
    if not deployed:
        raise RuntimeError("deploy wrapper returned success without a persisted target SHA")
    if deployed != candidate:
        print(
            f"OCI_DEPLOY_WATCH_SUPERSEDED repo_ref={candidate} deployed_sha={deployed}",
            flush=True,
        )
        return "superseded"
    print(f"OCI_DEPLOY_WATCH_OK repo_ref={candidate}", flush=True)
    return "deployed"


def watch() -> None:
    last_disabled_notice = False
    while True:
        delay = POLL_SECONDS
        try:
            result = iteration()
            if result == "disabled":
                if not last_disabled_notice:
                    print("OCI_DEPLOY_WATCH_DISABLED", flush=True)
                    last_disabled_notice = True
            else:
                last_disabled_notice = False
        except (OSError, RuntimeError, subprocess.SubprocessError, json.JSONDecodeError, urllib.error.URLError) as exc:
            delay = ERROR_BACKOFF_SECONDS
            print(
                f"OCI_DEPLOY_WATCH_ERROR type={type(exc).__name__} detail={str(exc)[:240]}",
                flush=True,
            )
        time.sleep(delay)


def self_test() -> None:
    sample = "0123456789abcdef0123456789abcdef01234567"
    assert valid_sha(sample) == sample
    assert valid_sha(sample.upper()) == sample
    assert valid_sha("main") == ""
    assert valid_sha("../" + sample) == ""
    assert build_from_health_payload({"build": sample}) == sample
    assert build_from_health_payload({"build": "main"}) == ""
    assert build_from_health_payload([]) == ""
    assert POLL_SECONDS == 15
    assert ERROR_BACKOFF_SECONDS >= POLL_SECONDS
    assert HTTP_TIMEOUT_SECONDS < POLL_SECONDS
    assert DEPLOY_WRAPPER == "/usr/local/sbin/chess-studio-deploy"
    assert ENABLE_MARKER == Path("/var/lib/chess-studio/DEPLOY_WATCH_ENABLED")
    source = Path(__file__).read_text(encoding="utf-8")
    tree = ast.parse(source)
    imported = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported.extend(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            imported.append(node.module or "")
    assert not any(name == "oci" or name.startswith("oci.") for name in imported)
    forbidden_oci_api_host = "oracle" + "cloud.com"
    assert forbidden_oci_api_host not in source.lower()
    assert "ls" + "-remote" not in source
    assert "refs/heads/" + "main" not in source
    assert "OCI_DEPLOY_WATCH_SUPERSEDED" in source
    assert '["sudo", "--non-interactive", DEPLOY_WRAPPER, candidate]' in source
    assert "ENABLE_MARKER.is_symlink()" in source
    print("OCI zero-cost deploy watcher self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    watch()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
