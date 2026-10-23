#!/usr/bin/env python3
"""Static host-lock invariants: the launcher must acquire lock before Git checkout.

This is a deploy ordering contract, not a mock of an OCI host or a promise that
Oracle's remote command channel is healthy.
"""
from pathlib import Path
import fcntl
import os
import signal
import subprocess
import sys
import tempfile

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
    # A failed/stalled network fetch while FD8 is held must not leave a
    # process indefinitely retaining the flock. Never proceed to checkout.
    launch_fetch = launcher.index('git -C "$repo" fetch --no-tags --depth=1 origin "$sha"')
    launch_timeout = launcher.index("GIT_TERMINAL_PROMPT=0 timeout --signal=TERM --kill-after=2s 90s")
    assert lock_wait < launch_timeout < launch_fetch < launcher.index('git -C "$repo" checkout --detach')
    assert launcher.count("GIT_TERMINAL_PROMPT=0 timeout --signal=TERM --kill-after=2s 90s") == 1

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
    # The payload runs after FD8's root-host flock is acquired. Never let a
    # stalled GitHub/DNS credential probe retain that mutation lock forever.
    assert "require timeout" in payload
    resolver = payload.split("resolve_staging_main() {", 1)[1].split(
        "\n}\n\nsupersede_if_stale() {", 1
    )[0]
    assert "GIT_TERMINAL_PROMPT=0 timeout --signal=TERM --kill-after=2s 5s" in resolver
    assert 'git -C "$repo" ls-remote --exit-code origin refs/heads/main' in resolver
    assert "if ! current_main=" in resolver
    assert "return 69" in resolver
    # Direct legacy payload acquires FD8 itself and must observe the same
    # bounded Git transport contract when its checkout is not pre-prepared.
    direct = payload.split('if [[ "${CHESS_STUDIO_CHECKOUT_READY:-0}" == "1" ]]; then', 1)[1].split(
        '\nfi\n', 1
    )[0]
    assert 'GIT_TERMINAL_PROMPT=0 timeout --signal=TERM --kill-after=2s 90s' in direct
    assert 'git fetch --no-tags --depth=1 origin "$sha"' in direct
    assert direct.index('timeout --signal=TERM --kill-after=2s 90s') < direct.index(
        'git fetch --no-tags --depth=1 origin "$sha"'
    ) < direct.index('git checkout --detach "$sha"')

    # Real coreutils smoke: expired subprocess is terminated, not allowed to
    # continue running while the host mutation flock would remain held.
    expired = subprocess.run(
        ["timeout", "--signal=TERM", "--kill-after=1s", "1s", "sleep", "3"],
        capture_output=True, timeout=4, check=False,
    )
    assert expired.returncode == 124


    # A live cloudflared tunnel is daemonized *inside* the deploy lock.
    # nohup/setsid do not close unrelated FDs: closing FD8 in runuser's
    # subtree (and redundantly on the daemon) prevents permanent flock leaks.
    tunnel = ROOT / "scripts/oci_staging_tunnel_connector.sh"
    tunnel_source = tunnel.read_text(encoding="utf-8")
    assert 'runuser -u "$RUNTIME_USER" -- env HOME="$runtime_home" /bin/bash -c' in tunnel_source
    assert '"$pid_file" 8>&-' in tunnel_source
    assert 'run --token-file "$3" </dev/null >/dev/null 2>&1 8>&- &' in tunnel_source
    subprocess.run(["bash", "-n", str(tunnel)], check=True)

    # Exercise the real Linux flock and nohup/setsid FD-inheritance behavior
    # with *temporary* processes. Old behavior keeps the flock held after
    # the launching shell exits; explicit 8>&- releases it while sleep lives.
    with tempfile.TemporaryDirectory(prefix="oci-tunnel-lock-contract-") as tmp:
        lock_path = Path(tmp) / "deploy.lock"
        for close_fd, expected_held in ((False, True), (True, False)):
            inner = ('nohup setsid sleep 8 </dev/null >/dev/null 2>&1 '
                     + ('8>&- ' if close_fd else '')
                     + '& printf "%s\\n" "$!"')
            script = ('exec 8>"$1"; flock -n 8; '
                      + '/bin/bash -c ' + "'" + inner + "'")
            launcher_result = subprocess.run(
                ["bash", "-c", script, "bash", str(lock_path)],
                text=True, capture_output=True, check=True, timeout=5,
            )
            child_pid = int(launcher_result.stdout.strip())
            try:
                # Live detached child is the potential long-lived FD holder.
                os.kill(child_pid, 0)
                fd = os.open(lock_path, os.O_RDONLY)
                try:
                    try:
                        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    except BlockingIOError:
                        actual_held = True
                    else:
                        actual_held = False
                        fcntl.flock(fd, fcntl.LOCK_UN)
                    assert actual_held is expected_held, (
                        f"detached FD8 inheritance mismatch: close={close_fd}"
                    )
                finally:
                    os.close(fd)
            finally:
                # Terminate only our synthetic test process; never touch host
                # deploy lock owners or real cloudflared here.
                try:
                    os.kill(child_pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass

    assert "rm -f .git/" not in launcher + payload
    # Root-host diagnostic is offline and strictly read-only in production.
    diag = ROOT / "scripts/oci_host_lock_triage.py"
    diagnostic_source = diag.read_text(encoding="utf-8")
    assert 'LOCK = Path("/var/lib/chess-studio/deploy.lock")' in diagnostic_source
    assert "os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW" in diagnostic_source
    assert "os.kill(" not in diagnostic_source and "subprocess.Popen(" not in diagnostic_source
    assert "descriptor.stat()" in diagnostic_source  # metadata-only, never FD contents
    assert '(process / "fdinfo" / descriptor.name).read_text(' in diagnostic_source
    assert "fdinfo_has_flock(info, device, inode)" in diagnostic_source
    assert "flock_witness_fds=" in diagnostic_source
    assert 'for line in contents.splitlines() if line.startswith("lock:")' in diagnostic_source
    assert "max_processes: int = 4096" in diagnostic_source
    assert "OCI_HOST_LOCK_FD_SCAN coverage=" in diagnostic_source
    assert "OCI_HOST_LOCK_FD_HOLDER pid=" in diagnostic_source
    # Correlate the specific FD8 tunnel inheritance hypothesis with exact
    # dev/inode and only an allowlisted /proc/PID/comm name, never argv/env.
    assert "def fd8_tunnel_hint(" in diagnostic_source
    assert '(proc / "fd" / "8").stat()' in diagnostic_source
    assert '(proc / "comm").read_text(' in diagnostic_source
    assert "cloudflared_comm_hint=" in diagnostic_source
    assert "fd8_match=" in diagnostic_source
    assert "cmdline" not in diagnostic_source.split("def fd8_tunnel_hint(", 1)[1].split("def self_test()", 1)[0]

    assert "OCI_HOST_LOCK_ACTION manual_review_only=yes" in diagnostic_source
    subprocess.run([sys.executable, "-S", str(diag), "--self-test"], check=True)
    print("OCI deploy host lock contract: OK")

if __name__ == "__main__":
    self_test()
