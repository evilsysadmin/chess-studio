#!/usr/bin/env python3
"""Static host-lock invariants: the launcher must acquire lock before Git checkout.

This is a deploy ordering contract, not a mock of an OCI host or a promise that
Oracle's remote command channel is healthy.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LAUNCH = ROOT / "scripts/oci_staging_deploy_launcher.sh"
DEPLOY = ROOT / "scripts/oci_existing_a1_deploy.sh"

def self_test():
    launcher = LAUNCH.read_text(encoding="utf-8")
    payload = DEPLOY.read_text(encoding="utf-8")
    before_fetch = launcher.index('git -C "$repo" fetch --no-tags')
    lock_wait = launcher.index('flock -w 120 8')
    lock_open = launcher.index('exec 8>"$deploy_lock_file"')
    assert lock_open < lock_wait < before_fetch
    assert 'CHESS_STUDIO_HOST_LOCK_HELD=1 CHESS_STUDIO_CHECKOUT_READY=1 exec /bin/bash' in launcher
    assert launcher.index("git -C \"$repo\" checkout --detach") < launcher.index("CHESS_STUDIO_HOST_LOCK_HELD=1")
    # The payload must NOT reopen inherited FD8 and cause a self-deadlock.
    assert 'if [[ "${CHESS_STUDIO_HOST_LOCK_HELD:-0}" == "1" ]]; then' in payload
    inherited = payload.split('if [[ "${CHESS_STUDIO_HOST_LOCK_HELD:-0}" == "1" ]]; then', 1)[1].split("\nelse\n", 1)[0]
    assert 'readlink /proc/self/fd/8' in inherited
    assert 'flock -n 8' in inherited
    assert 'exec 8>' not in inherited
    legacy = payload.split("\nelse\n", 1)[-1]
    assert 'flock -w 5 8' in legacy
    assert 'if supersede_if_stale; then' in payload
    assert "rm -f .git/" not in launcher + payload
    print("OCI deploy host lock contract: OK")

if __name__ == "__main__":
    self_test()
