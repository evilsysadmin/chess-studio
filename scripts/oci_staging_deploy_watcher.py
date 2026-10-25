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
import fcntl
import json
import os
import re
import tempfile
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path
from unittest.mock import patch

AI_HEALTH_URL = os.environ.get(
    "CHESS_STUDIO_STAGING_AI_HEALTH_URL",
    "https://ai-staging.shadowops.dpdns.org/health",
).strip()
STATE_FILE = Path(os.environ.get("CHESS_STUDIO_STATE_FILE", "/var/lib/chess-studio/deployed.sha"))
ENABLE_MARKER = Path(
    os.environ.get("CHESS_STUDIO_DEPLOY_WATCH_MARKER", "/var/lib/chess-studio/DEPLOY_WATCH_ENABLED")
)
DEPLOY_LOCK_PATH = Path("/var/lib/chess-studio/deploy.lock")
DEPLOY_WRAPPER = os.environ.get(
    "CHESS_STUDIO_DEPLOY_WRAPPER",
    "/usr/local/sbin/chess-studio-deploy",
).strip()
# The Go API image is the only image the deploy pulls (Python was retired on
# 2026-10-10); the deploy waits for nothing else.
GO_IMAGE_PREFIX = os.environ.get(
    "CHESS_STUDIO_GO_IMAGE_PREFIX",
    "ghcr.io/evilsysadmin/chess-studio-pvp:oci-",
).strip()
POLL_SECONDS = 15
ERROR_BACKOFF_SECONDS = 30
MAX_DEPLOY_ERROR_BACKOFF_SECONDS = 300
# Avoid hot-looping a stale Worker SHA without permanently suppressing recovery.
SUPERSEDED_RETRY_SECONDS = 300
HTTP_TIMEOUT_SECONDS = 8
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



def go_image_ref(candidate: str) -> str:
    return f"{GO_IMAGE_PREFIX}{candidate}"


def image_available(ref: str) -> bool:
    result = subprocess.run(
        ["docker", "manifest", "inspect", ref],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
        timeout=HTTP_TIMEOUT_SECONDS,
    )
    return result.returncode == 0


def backend_image_available(candidate: str) -> bool:
    return image_available(go_image_ref(candidate))


def deploy_lock_busy() -> bool:
    """Avoid queueing the watcher behind a CI/host mutation.

    A read-only, nonblocking probe never replaces the root wrapper's lock
    or its exact-SHA admission. Unknown/unreadable locks are treated as busy.
    """
    try:
        fd = os.open(DEPLOY_LOCK_PATH, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    except FileNotFoundError:
        return False  # The root wrapper will create and own the lock.
    except OSError:
        return True
    try:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return True
        fcntl.flock(fd, fcntl.LOCK_UN)
        return False
    except OSError:
        return True
    finally:
        os.close(fd)


def deploy(candidate: str) -> None:
    # Do not put a timeout around sudo: subprocess.run(timeout=...) kills only
    # its immediate child. The root-owned launcher/grandchildren may survive,
    # retaining FD8's flock indefinitely after the watcher reports timeout.
    # Serialize by waiting for the authoritative root wrapper to finish; the
    # watcher does not start another deploy while this call is outstanding.
    subprocess.run(
        ["sudo", "--non-interactive", DEPLOY_WRAPPER, candidate],
        check=True,
    )


class WatchDeployError(RuntimeError):
    """A specific immutable SHA failed at the root-owned deploy boundary."""

    def __init__(self, candidate: str, code: int | None):
        self.candidate = candidate
        self.code = code
        super().__init__(f"deploy repo_ref={candidate} rc={code if code is not None else 'timeout'}")


def repeated_error_delay(previous_sha: str, failures: int, candidate: str) -> tuple[int, int]:
    """Avoid hammering a stuck host lock, but never inherit delay across SHAs."""
    streak = min(5, failures + 1) if previous_sha == candidate else 1
    return streak, min(MAX_DEPLOY_ERROR_BACKOFF_SECONDS, ERROR_BACKOFF_SECONDS * 2 ** (streak - 1))


def iteration(rejected_sha: str = "") -> tuple[str, str]:
    if not ENABLE_MARKER.is_file() or ENABLE_MARKER.is_symlink():
        return "disabled", ""

    candidate = fetch_worker_build()
    if candidate == read_deployed_sha():
        return "current", candidate
    # The root-owned deploy wrapper already proved this exact generation stale.
    # Git main cannot move backwards to that SHA in the normal release train.
    # Avoid reacquiring deploy.lock every 15s; watch() expires the suppression
    # after a bounded delay so temporary or misclassified results can recover.
    if candidate == rejected_sha:
        return "known-superseded", candidate
    if deploy_lock_busy():
        print(f"OCI_DEPLOY_WATCH_LOCK_BUSY repo_ref={candidate}", flush=True)
        return "lock-busy", candidate
    if not backend_image_available(candidate):
        print(f"OCI_DEPLOY_WATCH_IMAGE_PENDING repo_ref={candidate}", flush=True)
        return "image-pending", candidate

    print(f"OCI_DEPLOY_WATCH_TRIGGER repo_ref={candidate}", flush=True)
    try:
        deploy(candidate)
    except subprocess.CalledProcessError as exc:
        raise WatchDeployError(candidate, exc.returncode) from exc
    except subprocess.TimeoutExpired as exc:
        raise WatchDeployError(candidate, None) from exc
    deployed = read_deployed_sha()
    if not deployed:
        raise RuntimeError("deploy wrapper returned success without a persisted target SHA")
    if deployed != candidate:
        print(
            f"OCI_DEPLOY_WATCH_SUPERSEDED repo_ref={candidate} deployed_sha={deployed}",
            flush=True,
        )
        return "superseded", candidate
    print(f"OCI_DEPLOY_WATCH_OK repo_ref={candidate}", flush=True)
    return "deployed", candidate


def active_rejection(sha: str, deadline: float, now: float) -> str:
    return sha if sha and now < deadline else ""


def remember_rejected_sha(previous: str, result: str, candidate: str) -> str:
    if result == "superseded":
        return candidate
    if result in {"deployed", "current"}:
        return ""
    return previous


def watch() -> None:
    last_disabled_notice = False
    rejected_sha = ""
    rejected_until = 0.0
    last_failed_deploy_sha = ""
    consecutive_deploy_errors = 0
    while True:
        delay = POLL_SECONDS
        try:
            eligible_rejection = active_rejection(rejected_sha, rejected_until, time.monotonic())
            result, candidate = iteration(eligible_rejection)
            last_failed_deploy_sha = ""
            consecutive_deploy_errors = 0
            rejected_sha = remember_rejected_sha(eligible_rejection, result, candidate)
            if result == "superseded":
                rejected_until = time.monotonic() + SUPERSEDED_RETRY_SECONDS
            elif not rejected_sha:
                rejected_until = 0.0
            if result == "disabled":
                if not last_disabled_notice:
                    print("OCI_DEPLOY_WATCH_DISABLED", flush=True)
                    last_disabled_notice = True
            else:
                last_disabled_notice = False
        except (OSError, RuntimeError, subprocess.SubprocessError, json.JSONDecodeError, urllib.error.URLError) as exc:
            delay = ERROR_BACKOFF_SECONDS
            if isinstance(exc, WatchDeployError):
                consecutive_deploy_errors, delay = repeated_error_delay(
                    last_failed_deploy_sha, consecutive_deploy_errors, exc.candidate
                )
                last_failed_deploy_sha = exc.candidate
            else:
                last_failed_deploy_sha = ""
                consecutive_deploy_errors = 0
            print(
                f"OCI_DEPLOY_WATCH_ERROR type={type(exc).__name__} detail={str(exc)[:240]} delay_s={delay}",
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
    assert MAX_DEPLOY_ERROR_BACKOFF_SECONDS == 300
    assert [repeated_error_delay(sample, n - 1, sample)[1] for n in range(1, 7)] == [
        30, 60, 120, 240, 300, 300,
    ]
    assert repeated_error_delay(sample, 5, "a" * 40) == (1, 30)
    assert repeated_error_delay(sample, 5, sample) == (5, 300)
    assert WatchDeployError(sample, 75).candidate == sample
    # A supervisor timeout must never kill just sudo and orphan the root
    # launcher/grandchildren that might continue holding deploy.lock.
    with patch(f"{__name__}.subprocess.run") as supervised_run:
        deploy(sample)
        supervised_run.assert_called_once_with(
            ["sudo", "--non-interactive", DEPLOY_WRAPPER, sample],
            check=True,
        )
    assert str(WatchDeployError(sample, None)).endswith("rc=timeout")
    assert SUPERSEDED_RETRY_SECONDS >= ERROR_BACKOFF_SECONDS
    assert HTTP_TIMEOUT_SECONDS < POLL_SECONDS
    assert DEPLOY_WRAPPER == "/usr/local/sbin/chess-studio-deploy"
    assert GO_IMAGE_PREFIX.endswith(":oci-")
    assert go_image_ref(sample) == "ghcr.io/evilsysadmin/chess-studio-pvp:oci-" + sample
    assert ENABLE_MARKER == Path("/var/lib/chess-studio/DEPLOY_WATCH_ENABLED")
    assert DEPLOY_LOCK_PATH == Path("/var/lib/chess-studio/deploy.lock")
    with tempfile.TemporaryDirectory(prefix="chess-watcher-lock-") as tmp:
        with patch(f"{__name__}.DEPLOY_LOCK_PATH", Path(tmp) / "deploy.lock"):
            assert not deploy_lock_busy()  # Missing lock is not a blocker.
            fd = os.open(DEPLOY_LOCK_PATH, os.O_RDWR | os.O_CREAT, 0o600)
            try:
                assert not deploy_lock_busy()
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                assert deploy_lock_busy()
            finally:
                fcntl.flock(fd, fcntl.LOCK_UN)
                os.close(fd)
            assert not deploy_lock_busy()
            os.symlink(Path(tmp) / "other", DEPLOY_LOCK_PATH.with_name("unsafe-link"))
        with patch(f"{__name__}.DEPLOY_LOCK_PATH", Path(tmp) / "unsafe-link"):
            assert deploy_lock_busy()  # Never follow a malicious lock symlink.
    # Regression: a superseded Worker build must not trigger another OCI
    # manifest lookup or sudo deploy until its immutable SHA changes.
    rejected = "a" * 40
    newer = "b" * 40
    assert remember_rejected_sha("", "superseded", sample) == sample
    assert remember_rejected_sha(sample, "known-superseded", sample) == sample
    assert remember_rejected_sha(sample, "image-pending", newer) == sample
    assert remember_rejected_sha(sample, "deployed", newer) == ""
    assert remember_rejected_sha(sample, "current", sample) == ""
    assert active_rejection(sample, 500.0, 499.0) == sample
    assert active_rejection(sample, 500.0, 500.0) == ""
    assert active_rejection(sample, 500.0, 501.0) == ""
    with (
        patch(f"{__name__}.ENABLE_MARKER") as marker,
        patch(f"{__name__}.fetch_worker_build", return_value=sample),
        patch(f"{__name__}.read_deployed_sha", return_value=rejected),
        patch(f"{__name__}.backend_image_available") as image_lookup,
        patch(f"{__name__}.deploy_lock_busy", return_value=False) as lock_busy,
        patch(f"{__name__}.deploy") as deploy_call,
    ):
        marker.is_file.return_value = True
        marker.is_symlink.return_value = False
        assert iteration(active_rejection(sample, 500.0, 499.0)) == ("known-superseded", sample)
        image_lookup.assert_not_called()
        deploy_call.assert_not_called()
        lock_busy.return_value = True
        assert iteration() == ("lock-busy", sample)
        image_lookup.assert_not_called()
        deploy_call.assert_not_called()
        lock_busy.return_value = False
        image_lookup.return_value = True
        # The same Worker SHA is retried after bounded expiry, never forgotten forever.
        assert iteration(active_rejection(sample, 500.0, 500.0)) == ("superseded", sample)
        deploy_call.assert_called_once_with(sample)
        assert iteration(newer) == ("superseded", sample)
        assert deploy_call.call_count == 2
        # A failed sudo deploy is attributed to the candidate SHA, not to
        # a generic image/HTTP failure (only these failures get long backoff).
        deploy_call.side_effect = subprocess.CalledProcessError(75, ["sudo", DEPLOY_WRAPPER, sample])
        try:
            iteration()
        except WatchDeployError as exc:
            assert exc.candidate == sample and exc.code == 75
        else:
            raise AssertionError("failed root deploy must retain immutable SHA")
        deploy_call.side_effect = subprocess.TimeoutExpired(["sudo", DEPLOY_WRAPPER, sample], 900)
        try:
            iteration()
        except WatchDeployError as exc:
            assert exc.candidate == sample and exc.code is None
        else:
            raise AssertionError("timed out root deploy must retain immutable SHA")
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
    assert '["docker", "manifest", "inspect", ref]' in source
    assert "return image_available(go_image_ref(candidate))" in source
    assert "chess-studio-" + "backend:" not in source
    assert "OCI_DEPLOY_WATCH_IMAGE_PENDING" in source
    assert "OCI_DEPLOY_WATCH_LOCK_BUSY" in source
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
