#!/usr/bin/env python3
"""Safe runtime diagnostics for the Chess Studio OCI staging backend.

The command intentionally reads only Docker state and the three public system
endpoints. It never prints container environment, application logs, runtime
files, or secret-bearing configuration.
"""
from __future__ import annotations

import argparse
import re

from oci_run_command import assert_nonsecret_command, config_from_env, diagnose_plugin, execute, validate_sha


def diagnostic_command(expected_sha: str | None = None) -> str:
    command = r'''set -u
printf '%s\n' 'OCI_BACKEND_DIAG_BEGIN'
checkout="$(GIT_OPTIONAL_LOCKS=0 git -c safe.directory=/opt/chess-studio/repo \
  -C /opt/chess-studio/repo rev-parse --verify 'HEAD^{commit}' 2>/dev/null || true)"
checkout_reason=ok
if [[ ! "$checkout" =~ ^[0-9a-f]{40}$ ]]; then
  checkout=unavailable
  if [[ ! -d /opt/chess-studio/repo/.git ]]; then
    checkout_reason=missing
  elif [[ ! -r /opt/chess-studio/repo/.git/HEAD ]]; then
    checkout_reason=unreadable
  else
    checkout_reason=git_error
  fi
fi
committed=unavailable
state=/var/lib/chess-studio/deployed.sha
if [[ -f "$state" && ! -L "$state" ]]; then
  committed="$(tr -d '\r\n' <"$state")"
  [[ "$committed" =~ ^[0-9a-f]{40}$ ]] || committed=unavailable
fi
color=unknown
color_file=/var/lib/chess-studio/active.color
if [[ -f "$color_file" && ! -L "$color_file" ]]; then
  color="$(tr -d '\r\n' <"$color_file")"
  [[ "$color" == blue || "$color" == green ]] || color=unknown
fi
watcher="$(systemctl is-active chess-studio-deploy-watcher.service 2>/dev/null || true)"
case "$watcher" in active|inactive|failed|activating|deactivating) ;; *) watcher=unknown ;; esac
watch_enabled=no
[[ -f /var/lib/chess-studio/DEPLOY_WATCH_ENABLED && ! -L /var/lib/chess-studio/DEPLOY_WATCH_ENABLED ]] && watch_enabled=yes
printf 'OCI_BACKEND_PROVENANCE checkout=%s checkout_reason=%s committed=%s color=%s watcher=%s enabled=%s\n' \
  "$checkout" "$checkout_reason" "$committed" "$color" "$watcher" "$watch_enabled"
source_launcher=/opt/chess-studio/repo/scripts/oci_staging_deploy_launcher.sh
host_launcher=/usr/local/sbin/chess-studio-deploy
launcher_status=unavailable
if [[ -f "$source_launcher" && ! -L "$source_launcher" && -r "$source_launcher" &&
      -f "$host_launcher" && ! -L "$host_launcher" && -r "$host_launcher" ]]; then
  if cmp -s "$source_launcher" "$host_launcher"; then
    launcher_status=match
  else
    launcher_status=drift
  fi
fi
printf 'OCI_BACKEND_LAUNCHER installed_vs_checkout=%s\n' "$launcher_status"
lock_state=unavailable
if [[ -r /var/lib/chess-studio/deploy.lock && ! -L /var/lib/chess-studio/deploy.lock ]]; then
  flock -n -E 73 9 9</var/lib/chess-studio/deploy.lock
  case "$?" in 0) lock_state=free;; 73) lock_state=held;; esac
fi
printf 'OCI_BACKEND_LOCK state=%s\n' "$lock_state"
if [[ "$lock_state" == held && -r /proc/locks ]]; then
  ino="$(stat -Lc %i /var/lib/chess-studio/deploy.lock 2>/dev/null)"
  pid="$(awk -v n="$ino" '$2=="FLOCK" && $6 ~ (":" n "$") {print $5; exit}' /proc/locks)"
  [[ "$pid" =~ ^[1-9][0-9]*$ ]] || pid=unknown
  age="$(ps -o etimes= -p "$pid" 2>/dev/null | tr -dc '0-9')"
  [[ "$age" =~ ^[0-9]{1,10}$ ]] || age=unknown
  echo "OCI_BACKEND_LOCK_CANDIDATE pid=$pid age_s=$age"
fi
events="$(set -o pipefail; timeout 5 journalctl -u chess-studio-deploy-watcher.service -n 80 -o cat 2>/dev/null | awk '/OCI_DEPLOY_WATCH_/{a[substr($1,18,1)]++}END{printf "t=%d ok=%d err=%d stale=%d",a["T"],a["O"],a["E"],a["S"]}')" || events=unavailable
echo "OCI_WATCH_EVENTS $events"
for service in edge pvp_blue pvp_green; do
  container_id="$(docker ps -aq \
    --filter 'label=com.docker.compose.project=chess-studio-staging' \
    --filter "label=com.docker.compose.service=$service" | head -n1)"
  if [ -n "$container_id" ]; then
    docker inspect --format "OCI_BACKEND_CONTAINER service=$service status={{.State.Status}} exit={{.State.ExitCode}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} image={{.Config.Image}}" "$container_id"
  fi
done
legacy_state="$(systemctl is-active chess-studio-backend.service 2>/dev/null || true)"
printf 'OCI_BACKEND_LEGACY_UNIT state=%s\n' "${legacy_state:-unknown}"
for endpoint in health ready release; do
  tmp="$(mktemp /tmp/chess-studio-diag.XXXXXX)"
  code="$(curl --silent --show-error --max-time 8 -o "$tmp" -w '%{http_code}' "http://127.0.0.1:4000/api/$endpoint" 2>/dev/null || true)"
  body="$(tr '\r\n' '  ' <"$tmp" | head -c 800)"
  rm -f "$tmp"
  printf 'OCI_BACKEND_ENDPOINT name=%s status=%s body=%s\n' "$endpoint" "${code:-curl-error}" "$body"
done
printf '%s\n' 'OCI_BACKEND_DIAG_END'
'''
    if expected_sha is not None:
        sha = validate_sha(expected_sha)
        # OCI may omit the complete TEXT transcript. Encode the relationship
        # between the two host SHA markers and the expected SHA in the process
        # exit status; never treat this as public endpoint accreditation.
        command += f"""
if [[ "$checkout" == "{sha}" && "$committed" == "{sha}" ]]; then exit 0; fi
if [[ "$checkout" == unavailable || "$committed" == unavailable ]]; then exit 94; fi
if [[ "$checkout" == "{sha}" ]]; then exit 91; fi
if [[ "$committed" == "{sha}" ]]; then exit 92; fi
exit 90
"""
    assert_nonsecret_command(command)
    return command


def provenance_exit_code(exc: BaseException) -> int | None:
    # Only recognize our reserved read-only diagnostic statuses. Unrelated OCI
    # failures (auth, timeout, delivery) retain their original severity.
    match = re.match(r"^OCI Run Command failed: state=FAILED exit=(90|91|92|94)\b", str(exc))
    return int(match.group(1)) if match else None


def self_test() -> None:
    command = diagnostic_command()
    assert "docker inspect" in command
    assert "backend_blue" not in command  # no Python service since 2026-10-10
    assert "pvp_blue pvp_green" in command  # the only API slot once Python is retired
    assert "service=$service" in command
    assert "/api/health" not in command  # endpoint is composed from a fixed allow-list loop
    assert "for endpoint in health ready release" in command
    assert "docker logs" not in command
    assert "docker inspect Env" not in command
    assert "backend.env" not in command
    assert "OCI_BACKEND_DIAG_END" in command
    assert "OCI_BACKEND_PROVENANCE checkout=%s checkout_reason=%s committed=%s" in command
    sample = "0123456789abcdef0123456789abcdef01234567"
    matched = diagnostic_command(sample)
    assert f'if [[ "$checkout" == "{sample}" && "$committed" == "{sample}" ]]' in matched
    assert "exit 91;" in matched and "exit 92;" in matched
    assert "exit 94;" in matched and "exit 90" in matched
    assert len(matched.encode("utf-8")) <= 4096
    try:
        diagnostic_command("main")
    except SystemExit:
        pass
    else:
        raise AssertionError("mutable expected source must be rejected")
    for status in (90, 91, 92, 94):
        error = SystemExit(f"OCI Run Command failed: state=FAILED exit={status} detail=no command output")
        assert provenance_exit_code(error) == status
    assert provenance_exit_code(SystemExit("OCI Run Command failed: state=FAILED exit=75")) is None
    assert provenance_exit_code(SystemExit("OCI Run Command polling timed out")) is None
    assert "GIT_OPTIONAL_LOCKS=0 git -c safe.directory=/opt/chess-studio/repo" in command
    assert "rev-parse --verify 'HEAD^{commit}'" in command
    assert "checkout_reason=unreadable" in command
    assert "checkout_reason=git_error" in command
    assert "chess-studio-deploy-watcher.service" in command
    assert "OCI_BACKEND_LAUNCHER installed_vs_checkout=%s" in command
    assert "OCI_BACKEND_LOCK state=%s" in command
    # Candidate PID is evidence, not proof: /proc/locks may hide an inherited
    # owner or show a same-inode collision on another device. Never take action
    # based on this read-only hint without verifying the actual process.
    assert "OCI_BACKEND_LOCK_CANDIDATE pid=$pid age_s=$age" in command
    assert '[[ "$lock_state" == held && -r /proc/locks ]]' in command
    assert '[[ "$pid" =~ ^[1-9][0-9]*$ ]] || pid=unknown' in command
    assert "ps -o etimes= -p" in command
    assert "kill " not in command and "fuser -k" not in command
    assert "flock -n -E 73 9 9</var/lib/chess-studio/deploy.lock" in command
    assert "lock_state=unavailable" in command
    assert "lock_state=free" in command and "lock_state=held" in command
    assert "lslocks -n" not in command
    assert "cmp -s \"$source_launcher\" \"$host_launcher\"" in command
    assert all(f"launcher_status={status}" in command for status in ("match", "drift", "unavailable"))
    assert "DEPLOY_WATCH_ENABLED" in command
    assert "docker logs" not in command
    assert "journalctl -u chess-studio-deploy-watcher.service -n 80" in command
    assert "OCI_WATCH_EVENTS $events" in command
    assert "|| events=unavailable" in command
    # Only fixed event counters may be emitted; journal contents are never echoed.
    import subprocess
    metrics = command.split("journalctl -u chess-studio-deploy-watcher.service", 1)[1]
    awk_source = metrics.split("| awk '", 1)[1].split("'", 1)[0]
    sample_events = (
        "OCI_DEPLOY_WATCH_TRIGGER repo_ref=sample\n"
        "OCI_DEPLOY_WATCH_OK repo_ref=sample\n"
        "OCI_DEPLOY_WATCH_ERROR type=RuntimeError SECRET_CANARY=do-not-print\n"
        "OCI_DEPLOY_WATCH_SUPERSEDED repo_ref=sample\n"
        "SECRET_CANARY=another-secret\n"
    )
    aggregated = subprocess.run(
        ["awk", awk_source], input=sample_events, text=True,
        capture_output=True, check=True,
    ).stdout
    assert aggregated == "t=1 ok=1 err=1 stale=1"
    assert "SECRET_CANARY" not in aggregated
    assert "cat /" not in command and "printenv" not in command
    # The probe uses an O_RDONLY fd and recognizes the dedicated contention
    # code, never conflating permission/command errors with a held lock.
    import fcntl
    import tempfile
    from pathlib import Path
    with tempfile.TemporaryDirectory() as scratch:
        lock = Path(scratch) / "deploy.lock"
        lock.touch()
        check = "flock -n -E 73 9 9<" + str(lock)
        open_result = subprocess.run(["bash", "-c", check], check=False)
        assert open_result.returncode == 0
        with lock.open("rb") as owner:
            fcntl.flock(owner.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            held_result = subprocess.run(["bash", "-c", check], check=False)
            assert held_result.returncode == 73
            fcntl.flock(owner.fileno(), fcntl.LOCK_UN)
        assert subprocess.run(["bash", "-c", check], check=False).returncode == 0
    for payload in (command, matched):
        subprocess.run(["bash", "-n"], input=payload, text=True, check=True, capture_output=True)
    # Synthetic read-only fixtures prove all four no-text classifications.
    classifier_start = matched.index(
        f'if [[ "$checkout" == "{sample}" && "$committed" == "{sample}" ]]'
    )
    classifier = matched[classifier_start:]
    for checkout, committed, expected_rc in (
        (sample, sample, 0),
        (sample, "a" * 40, 91),
        ("b" * 40, sample, 92),
        ("b" * 40, "a" * 40, 90),
        ("unavailable", sample, 94),
        (sample, "unavailable", 94),
        ("unavailable", "unavailable", 94),
    ):
        result = subprocess.run(
            ["bash", "-c", f'checkout={checkout}; committed={committed};\n{classifier}'],
            text=True, capture_output=True, check=False,
        )
        assert result.returncode == expected_rc, (checkout, committed, result.returncode)
    print("OCI backend diagnostics self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--expected-sha", default=None,
                        help="40-character SHA for read-only host provenance classification")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0

    try:
        import oci  # type: ignore
    except ImportError as exc:
        raise SystemExit("OCI Python SDK is required: pip install oci") from exc

    config = config_from_env(oci)
    diagnose_plugin(oci, config)
    try:
        execute(
            oci,
            config,
            diagnostic_command(args.expected_sha),
            display_name="chess-studio-backend-diagnose",
            timeout=120,
        )
    except SystemExit as exc:
        status = provenance_exit_code(exc) if args.expected_sha else None
        if status is None:
            raise
        print(f"OCI_BACKEND_PROVENANCE_EXIT_CODE={status}", flush=True)
        return status
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
