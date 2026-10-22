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
# Read-only immutable provenance. Never read runtime env, tokens or logs.
# Run Command executes as ocarun, while Git metadata belongs to the
# deployment operator. Trust ONLY the fixed local checkout, not arbitrary paths.
# Git must not acquire index locks or need write access for this read-only probe.
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
if [[ "$checkout" == "{sha}" ]]; then exit 91; fi
if [[ "$committed" == "{sha}" ]]; then exit 92; fi
if [[ "$checkout" == unavailable || "$committed" == unavailable ]]; then exit 94; fi
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
    assert "DEPLOY_WATCH_ENABLED" in command
    assert "docker logs" not in command and "journalctl" not in command
    assert "cat /" not in command and "printenv" not in command
    import subprocess
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
        ("unavailable", sample, 92),
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
