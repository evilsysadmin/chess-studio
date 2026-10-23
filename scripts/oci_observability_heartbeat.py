#!/usr/bin/env python3
"""Bounded independent staging probes for direct OTLP and Alloy filelog.

Unlike deploy-time probes, this runs without mutating the API or deployment state.
No credentials or HTTP response bodies are printed.
"""
from __future__ import annotations

import argparse
import datetime as dt
import fcntl
import json
import os
import re
import stat
import tempfile
from pathlib import Path
from unittest.mock import patch

from otel_log_ingest_probe import send_probe

SHA = re.compile(r"[0-9a-f]{40}\Z")
ROOT = Path("/var/lib/chess-studio")
ENV = Path("/etc/chess-studio/backend.env")
LOCK = ROOT / "deploy.lock"


def regular_file(path: Path) -> bool:
    try:
        return stat.S_ISREG(path.lstat().st_mode) and not path.is_symlink()
    except OSError:
        return False


def busy_lock(path: Path) -> bool:
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    except FileNotFoundError:
        return False
    except OSError:
        return True
    try:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return True
        except OSError:
            return True
        fcntl.flock(fd, fcntl.LOCK_UN)
        return False
    finally:
        os.close(fd)


def append_filelog(path: Path, sha: str, now: dt.datetime) -> None:
    if not regular_file(path) or path.stat().st_size > 1024 * 1024:
        raise ValueError("filelog probe path unavailable or exceeds size budget")
    body = json.dumps({"event": "oci_alloy_probe", "repo_ref": sha, "target": "staging"},
                      separators=(",", ":"), sort_keys=True)
    row = {"log": body + "\n", "stream": "stdout",
           "time": now.astimezone(dt.timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")}
    fd = os.open(path, os.O_WRONLY | os.O_APPEND | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            raise ValueError("filelog probe is not a regular file")
        payload = (json.dumps(row, separators=(",", ":"), sort_keys=True) + "\n").encode()
        with os.fdopen(fd, "ab", closefd=False) as handle:
            handle.write(payload)
            handle.flush()
    finally:
        os.close(fd)


def once(*, env: Path = ENV, state: Path = ROOT / "deployed.sha",
         directory: Path = ROOT / "observability", lock: Path = LOCK,
         send=send_probe) -> int:
    if busy_lock(lock):
        print("OCI_LOG_HEARTBEAT_SKIP reason=deploy-lock-busy")
        return 0
    if not regular_file(state) or not regular_file(env) or directory.is_symlink() or not directory.is_dir():
        print("OCI_LOG_HEARTBEAT_FAIL reason=runtime-unavailable")
        return 1
    sha = state.read_text(encoding="ascii").strip()
    if SHA.fullmatch(sha) is None:
        print("OCI_LOG_HEARTBEAT_FAIL reason=invalid-deployed-sha")
        return 1

    # Verify the non-secret deployment environment without exposing runtime keys.
    from otel_log_ingest_probe import parse_env
    values = parse_env(env)
    if values.get("ENVIRONMENT") != "staging":
        print("OCI_LOG_HEARTBEAT_FAIL reason=not-staging")
        return 1
    failed = False
    try:
        send(env, "chess-studio-oci-log-probe-staging", "staging", sha)
        print("OCI_LOG_HEARTBEAT_DIRECT_OK")
    except (Exception, SystemExit):
        failed = True
        print("OCI_LOG_HEARTBEAT_DIRECT_FAIL")
    try:
        append_filelog(directory / f"alloy-probe-{sha}-json.log", sha, dt.datetime.now(dt.timezone.utc))
        print("OCI_LOG_HEARTBEAT_FILELOG_WRITTEN")
    except (OSError, ValueError):
        failed = True
        print("OCI_LOG_HEARTBEAT_FILELOG_FAIL")
    return 1 if failed else 0


def self_test() -> None:
    sha = "a" * 40
    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp)
        env = root / "backend.env"
        env.write_text("ENVIRONMENT=staging\nOTEL_EXPORTER_OTLP_ENDPOINT=https://example.invalid/otlp\n")
        state = root / "deployed.sha"
        state.write_text(sha + "\n")
        directory = root / "observability"
        directory.mkdir()
        marker = directory / f"alloy-probe-{sha}-json.log"
        marker.write_text("")
        lock = root / "deploy.lock"
        calls = []

        def send(*args):
            calls.append(args)

        assert once(env=env, state=state, directory=directory, lock=lock, send=send) == 0
        assert len(calls) == 1 and calls[0][1:] == ("chess-studio-oci-log-probe-staging", "staging", sha)
        record = json.loads(marker.read_text().splitlines()[-1])
        assert json.loads(record["log"])["event"] == "oci_alloy_probe"
        assert json.loads(record["log"])["repo_ref"] == sha

        fd = os.open(lock, os.O_RDWR | os.O_CREAT, 0o600)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            assert once(env=env, state=state, directory=directory, lock=lock, send=send) == 0
            assert len(calls) == 1  # Never compete with an active deployment.
        finally:
            fcntl.flock(fd, fcntl.LOCK_UN)
            os.close(fd)

        marker.unlink()
        marker.symlink_to(env)
        assert once(env=env, state=state, directory=directory, lock=lock, send=send) == 1
        assert "ENVIRONMENT=staging" in env.read_text()
        marker.unlink()
        marker.write_text("")
        def reject(*_args):
            raise SystemExit("sensitive message never printed")
        assert once(env=env, state=state, directory=directory, lock=lock, send=reject) == 1
        assert marker.stat().st_size > 0  # Independent filelog path is still tested.
        state.write_text("bad\n")
        assert once(env=env, state=state, directory=directory, lock=lock, send=send) == 1
    print("OCI observability heartbeat self-test: OK")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
    else:
        raise SystemExit(once())
