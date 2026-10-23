#!/usr/bin/env python3
"""Fail closed until the immutable Go runtime image for staging exists.

Main image publication and staging-deploy run independently. The OCI A1 deploy
only pulls chess-studio-pvp; legacy backend and backend-go tags are published
for compatibility but must not delay this Go runtime's release.
"""
from __future__ import annotations

import argparse
import re
import subprocess
import time

import staging_generation as generation


class SupersededImageWait(RuntimeError):
    """A newer main SHA has replaced this generation before OCI mutation."""


_TAG = re.compile(r"^[0-9a-f]{40}$")
_REPOS = ("chess-studio-pvp",)
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
                    interval: float = 10, main_head=generation.current_main) -> int:
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
        # Read-only polling may outlive a newer merge. Check main every ~30s,
        # without touching host locks or starting an OCI Run Command. An
        # unreachable HEAD is an error, never evidence that the SHA is current.
        if attempt == 1 or (attempt - 1) % 3 == 0:
            current = main_head()
            if current != sha:
                raise SupersededImageWait(
                    f"GHCR wait superseded: {sha} != main {current}")
        remaining = deadline - clock()
        if remaining <= 0:
            raise RuntimeError(f"GHCR exact-SHA images not ready after {max_wait:g}s: {len(missing)} missing")
        if attempt == 1 or attempt % 6 == 0:
            print(f"GHCR pending for staging sha={sha}: {len(missing)} image(s), {remaining:.0f}s left", flush=True)
        pause(min(interval, remaining))


def self_test() -> None:
    sha = "a" * 40
    refs = image_refs(sha)
    assert refs == ("ghcr.io/evilsysadmin/chess-studio-pvp:oci-" + sha,)
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
        return len(calls) > 1
    def pause(seconds):
        ticks[0] += seconds
    assert wait_for_images(sha, exists=exists, clock=lambda: ticks[0],
                           pause=pause, max_wait=20, interval=2,
                           main_head=lambda: sha) == 2
    assert len(calls) == 2
    assert ticks[0] == 2
    try:
        wait_for_images(sha, exists=lambda ref: False, clock=lambda: ticks[0],
                        pause=pause, max_wait=3, interval=2,
                        main_head=lambda: sha)
    except RuntimeError:
        pass
    else:
        raise AssertionError("image wait failed open")
    # Newer main must stop GHCR polling before the 15-minute timeout.
    checked = []
    def latest():
        checked.append(len(checked))
        return sha if len(checked) == 1 else "b" * 40
    clock_value = [0.]
    def tick(seconds):
        clock_value[0] += seconds
    try:
        wait_for_images(sha, exists=lambda _ref: False, clock=lambda: clock_value[0],
                        pause=tick, max_wait=900, interval=10, main_head=latest)
    except SupersededImageWait:
        pass
    else:
        raise AssertionError("superseded GHCR wait did not stop")
    assert clock_value[0] == 30 and len(checked) == 2
    # A broken HEAD probe must fail closed, not fall back to stale publication.
    def unavailable():
        raise generation.GenerationError("GitHub unavailable")
    try:
        wait_for_images(sha, exists=lambda _ref: False, main_head=unavailable)
    except generation.GenerationError:
        pass
    else:
        raise AssertionError("unreadable HEAD was accepted")
    # Ready images do not need an extra remote probe: pre-OCI checks own that.
    assert wait_for_images(sha, exists=lambda _ref: True,
                           main_head=lambda: (_ for _ in ()).throw(AssertionError("unnecessary HEAD probe"))) == 1
    from unittest.mock import patch
    with patch("sys.argv", ["staging_image_ready.py", "--sha", sha]), \
         patch(f"{__name__}.wait_for_images", side_effect=SupersededImageWait("obsolete")):
        assert main() == 87
    print("staging-image-ready self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--sha")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    if not args.sha:
        parser.error("--sha required unless --self-test")
    try:
        wait_for_images(args.sha)
    except SupersededImageWait as exc:
        print(f"::notice title=GHCR superseded::{exc}", flush=True)
        return 87
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
