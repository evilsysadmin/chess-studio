#!/usr/bin/env python3
"""Safe runtime diagnostics for the Chess Studio OCI staging backend.

The command intentionally reads only Docker state and the three public system
endpoints. It never prints container environment, application logs, runtime
files, or secret-bearing configuration.
"""
from __future__ import annotations

import argparse

from oci_run_command import assert_nonsecret_command, config_from_env, diagnose_plugin, execute


def diagnostic_command() -> str:
    command = r'''set -u

printf '%s\n' 'OCI_BACKEND_DIAG_BEGIN'
# Read-only immutable provenance. Never read runtime env, tokens or logs.
checkout="$(git -C /opt/chess-studio/repo rev-parse HEAD 2>/dev/null || true)"
[[ "$checkout" =~ ^[0-9a-f]{40}$ ]] || checkout=unavailable
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
printf 'OCI_BACKEND_PROVENANCE checkout=%s committed=%s color=%s watcher=%s enabled=%s\n' \
  "$checkout" "$committed" "$color" "$watcher" "$watch_enabled"
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
    assert_nonsecret_command(command)
    return command


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
    assert "OCI_BACKEND_PROVENANCE checkout=%s committed=%s" in command
    assert "git -C /opt/chess-studio/repo rev-parse HEAD" in command
    assert "chess-studio-deploy-watcher.service" in command
    assert "DEPLOY_WATCH_ENABLED" in command
    assert "docker logs" not in command and "journalctl" not in command
    assert "cat /" not in command and "printenv" not in command
    import subprocess
    subprocess.run(["bash", "-n"], input=command, text=True, check=True, capture_output=True)
    print("OCI backend diagnostics self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
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
    execute(
        oci,
        config,
        diagnostic_command(),
        display_name="chess-studio-backend-diagnose",
        timeout=120,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
