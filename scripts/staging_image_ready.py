#!/usr/bin/env python3
"""Fail closed until all immutable GHCR image tags for a staging SHA exist.

Main image publication and staging-deploy are independent post-admission jobs.
Waiting for the OCI host watcher alone is not enough: it may miss the deadline
while the backend and Go images are still building for the first time.
"""
from __future__ import annotations

import argparse
import re
import subprocess
import time

_TAG = re.compile(r"^[0-9a-f]{40}$")
_REPOS = (
    "chess-studio-backend",
    "chess-studio-backend-go",
    "chess-studio-pvp",
)
_MAX_WAIT_S = 900


def image_refs(sha: str) -> tuple[str, ...]:
    if not _TAG.fullmatch(sha):
        raise ValueError("refuse non-exact 40-hex staging SHA")
    return tuple(f"ghcr.io/evilsysadmin/{repo}:oci-{sha}" for repo in _REPOS)


def is_published(ref: str) -> bool:
    try:
        result = subprocess.run(
            ("docker", "manifest", "inspect", ref),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=20,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return False
    return result.returncode == 0


def wait_for_images(sha: str, *, exists=is_published, clock=time.monotonic,
                    pause=time.sleep, max_wait: float = _MAX_WAIT_S,
                    interval: float = 10) -> int:
    if max_wait <= 0 or interval <= 0:
        raise ValueError("invalid image readiness wait settings")
    refs = image_refs(sha)
    deadline = clock() + max_wait
    attempt = 0
    while True:
        attempt += 1
        missing = [ref for ref in refs if not exists(ref)]
        if not missing:
            print(f"STAGING_GHCR_READY sha={sha} images={len(refs)} attempts={attempt}", flush=True)
            return attempt
        remaining = deadline - clock()
        if remaining <= 0:
            raise RuntimeError(f"GHCR exact-SHA images not ready after {max_wait:g}s: {len(missing)} missing")
        if attempt == 1 or attempt % 6 == 0:
            print(f"GHCR pending for staging sha={sha}: {len(missing)} image(s), {remaining:.0f}s left", flush=True)
        pause(min(interval, remaining))


def self_test() -> None:
    sha = "a" * 40
    refs = image_refs(sha)
    assert len(refs) == 3
    assert all(ref.endswith(":oci-" + sha) for ref in refs)
    for invalid in ("main", "0" * 39, "f" * 41, "F" * 40, "a" * 40 + "/x"):
        try:
            image_refs(invalid)
        except ValueError:
            pass
        else:
            raise AssertionError("accepted non-exact GHCR ref")
    calls = []
    ticks = [0.]
    def exists(ref):
        calls.append(ref)
        return len(calls) > 3
    def pause(seconds):
        ticks[0] += seconds
    assert wait_for_images(sha, exists=exists, clock=lambda: ticks[0],
                           pause=pause, max_wait=20, interval=2) == 2
    assert len(calls) == 6
    assert ticks[0] == 2
    try:
        wait_for_images(sha, exists=lambda ref: False, clock=lambda: ticks[0],
                        pause=pause, max_wait=3, interval=2)
    except RuntimeError:
        pass
    else:
        raise AssertionError("image wait failed open")
    print("staging-image-ready self-test: OK")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--sha")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if not args.sha:
        parser.error("--sha required unless --self-test")
    wait_for_images(args.sha)


if __name__ == "__main__":
    main()
