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
    lock_wait = launcher.index('flock -w 5 8')
    lock_open = launcher.index('exec 8>"$deploy_lock_file"')
    assert lock_open < lock_wait < before_fetch
    # A real watcher deployment can exceed 120s; waiting must not fail early.
    assert "lock_attempt<=84" in launcher
    assert "OCI_DEPLOY_LOCK_WAIT phase=launcher_checkout" in launcher
    assert "OCI_DEPLOY_LOCK_TIMEOUT phase=launcher_checkout waited_s=420" in launcher
    assert 'fuser -v "$deploy_lock_file"' in launcher
    # Never mutate Git before acquisition. A stale waiter exits without
    # checking out a superseded generation, including after getting the lock.
    stale_wait = launcher.index("OCI_DEPLOY_SUPERSEDED phase=launcher_lock_wait")
    stale_acquired = launcher.index("OCI_DEPLOY_SUPERSEDED phase=launcher_lock_acquired")
    assert lock_wait < stale_wait < stale_acquired < before_fetch
    assert 'git -C "$repo" ls-remote --exit-code origin refs/heads/main' in launcher
    assert "GIT_TERMINAL_PROMPT=0 timeout --signal=TERM --kill-after=2s 5s" in launcher
    assert 'command -v timeout >/dev/null' in launcher
    assert 'current_main="$(origin_main_sha 2>/dev/null || true)"' in launcher
    assert 'if ! current_main="$(origin_main_sha)"; then' in launcher
    assert "OCI_DEPLOY_MAIN_UNAVAILABLE phase=launcher_lock_acquired" in launcher
    assert "OCI_DEPLOY_MAIN_INVALID phase=launcher_lock_acquired" in launcher
    assert launcher.index('if ! current_main="$(origin_main_sha)"; then') < before_fetch
    assert 'current_main' in launcher
    assert 'flock -w 120 8' not in launcher
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
    # The last side-effect-free guard runs after the immutable Go image is
    # available but before the blue/green candidate can be recreated.
    pulled = payload.index('phase_done image_pull "$image_pull_started_ms"')
    guard = payload.index("OCI_DEPLOY_PRE_RECREATE_SUPERSEDED")
    recreate = payload.index('recreate_started_ms="$(now_ms)"')
    compose_recreate = payload.index('compose "$sha" up -d --no-build --force-recreate')
    assert pulled < guard < recreate < compose_recreate
    assert payload.count('OCI_DEPLOY_PRE_RECREATE_SUPERSEDED') == 1
    guard_section = payload[pulled:recreate]
    assert 'if supersede_if_stale; then' in guard_section
    assert '[["$status" == 42]]' not in guard_section
    assert 'if [[ "$status" == 42 ]]; then' in guard_section
    assert 'exit 0' in guard_section
    assert 'exit "$status"' in guard_section
    # The same reusable classifier always bypasses production and fails closed
    # when origin/main is unavailable; no unchecked "success" on network errors.
    classifier = payload[payload.index('supersede_if_stale() {'):pulled]
    assert '[[ "$target" == staging ]] || return 0' in classifier
    assert 'current_main="$(resolve_staging_main)" || return $?' in classifier
    assert "rm -f .git/" not in launcher + payload
    print("OCI deploy host lock contract: OK")

if __name__ == "__main__":
    self_test()
