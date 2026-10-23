#!/usr/bin/env python3
"""Read-only root/host namespace triage of the OCI staging deployment flock.

Run on the actual VM as root. Never deletes locks, signals processes, restarts
systemd, edits Git, or reads process cmdline/environ/secrets.
"""
from __future__ import annotations

import argparse
import fcntl
import os
from pathlib import Path
import tempfile

LOCK = Path("/var/lib/chess-studio/deploy.lock")
PROC = Path("/proc")


def parse_locks(contents: str, device: int, inode: int) -> list[int]:
    """Exact kernel dev+inode match; ignore other filesystem inode collisions."""
    owners: list[int] = []
    for line in contents.splitlines():
        parts = line.split()
        if len(parts) < 6 or parts[1] != "FLOCK":
            continue  # Includes blocked waiters with the '->' prefix.
        try:
            major, minor, number = parts[5].split(":")
            if (int(major, 16), int(minor, 16), int(number)) != (
                os.major(device), os.minor(device), inode
            ):
                continue
            owners.append(int(parts[4]))
        except (ValueError, IndexError):
            continue
    return owners


def lock_state(path: Path) -> tuple[str, os.stat_result | None]:
    """Do not follow symlinks; do not open the flock file for writing."""
    try:
        fd = os.open(path, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW)
    except FileNotFoundError:
        return "absent", None
    except OSError:
        return "unreadable", None
    try:
        st = os.fstat(fd)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return "held", st
        else:
            fcntl.flock(fd, fcntl.LOCK_UN)
            return "free", st
    finally:
        os.close(fd)


def process_age(pid: int, proc_root: Path) -> str:
    """Elapsed seconds from proc start ticks. Never expose comm/argv."""
    if pid <= 0:
        return "unknown"
    try:
        data = (proc_root / str(pid) / "stat").read_text(encoding="utf-8")
        # Field 22: starttime; after '(comm)' fields start at field 3.
        tail = data.rsplit(")", 1)[1].strip().split()
        start_ticks = int(tail[19])
        uptime = float((proc_root / "uptime").read_text().split()[0])
        seconds = int(uptime - start_ticks / os.sysconf("SC_CLK_TCK"))
        return str(seconds) if seconds >= 0 else "unknown"
    except (OSError, ValueError, IndexError, ZeroDivisionError):
        return "unknown"


def snapshot(path: Path = LOCK, proc_root: Path = PROC) -> tuple[str, list[tuple[int, str, str]]]:
    state, stat = lock_state(path)
    if state != "held" or stat is None:
        return state, []
    try:
        contents = (proc_root / "locks").read_text(encoding="utf-8")
    except OSError:
        return "held-unreadable-records", []
    result = []
    for pid in parse_locks(contents, stat.st_dev, stat.st_ino):
        visible = pid > 0 and (proc_root / str(pid)).is_dir()
        result.append((pid, "yes" if visible else "no",
                       process_age(pid, proc_root) if visible else "unknown"))
    return state, result


def self_test() -> None:
    with tempfile.TemporaryDirectory(prefix="oci-lock-triage-") as directory:
        path = Path(directory) / "deploy.lock"
        path.touch()
        state, records = snapshot(path)
        assert (state, records) == ("free", [])
        st = path.stat()
        key = f"{os.major(st.st_dev):02x}:{os.minor(st.st_dev):02x}:{st.st_ino}"
        sample = f"1: FLOCK ADVISORY WRITE 123 {key} 0 EOF"
        assert parse_locks(sample, st.st_dev, st.st_ino) == [123]
        assert parse_locks(f"2: FLOCK ADVISORY WRITE 123 00:00:{st.st_ino} 0 EOF", st.st_dev, st.st_ino) == (
            [123] if (os.major(st.st_dev), os.minor(st.st_dev)) == (0, 0) else []
        )
        assert not parse_locks(f"2: -> FLOCK ADVISORY WRITE 123 {key} 0 EOF", st.st_dev, st.st_ino)
        assert not parse_locks(sample.replace("FLOCK", "POSIX"), st.st_dev, st.st_ino)
        with path.open("rb") as owner:
            fcntl.flock(owner, fcntl.LOCK_EX | fcntl.LOCK_NB)
            assert lock_state(path)[0] == "held"
            proc = Path(directory) / "proc"
            proc.mkdir()
            (proc / "locks").write_text(sample, encoding="utf-8")
            (proc / "123").mkdir()
            assert snapshot(path, proc) == ("held", [(123, "yes", "unknown")])
            (proc / "123").rmdir()
            assert snapshot(path, proc) == ("held", [(123, "no", "unknown")])
            (proc / "locks").unlink()
            assert snapshot(path, proc) == ("held-unreadable-records", [])
            fcntl.flock(owner, fcntl.LOCK_UN)
        assert snapshot(path)[0] == "free"
        path.unlink()
        assert snapshot(path)[0] == "absent"
    print("oci-host-lock-triage self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    if os.geteuid() != 0:
        parser.error("host namespace root is required for complete lock ownership evidence")
    state, owners = snapshot()
    print(f"OCI_HOST_LOCK state={state} records={len(owners)}")
    for pid, visible, age in owners:
        print(f"OCI_HOST_LOCK_OWNER pid={pid} proc_visible={visible} age_s={age}")
    if state == "held" and not owners:
        print("OCI_HOST_LOCK_WARNING owner_unresolved=yes")
    print("OCI_HOST_LOCK_ACTION manual_review_only=yes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
