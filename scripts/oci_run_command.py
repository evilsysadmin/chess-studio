#!/usr/bin/env python3
"""Operate Chess Studio OCI staging through Oracle Cloud Agent Run Command.

The command channel deliberately carries no application secrets. Runtime
configuration is delivered separately through the private Object Storage
channel and fetched by the instance itself.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
import time
from typing import Any

COMPARTMENT_NAME = "chess-studio-staging"
INSTANCE_NAME = "chess-studio-staging"
SHA_RE = re.compile(r"^[0-9a-f]{40}$")
TERMINAL_STATES = {"SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELED"}
SECRET_MARKERS = (
    "MONGO_URL=",
    "JWT_SECRET=",
    "RESEND_API_KEY=",
    "CHESS_AI_SHARED_SECRET=",
    "INVITE_CODE=",
    "PRIVATE KEY",
)


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


def validate_sha(value: str) -> str:
    normalized = value.strip().lower()
    if not SHA_RE.fullmatch(normalized):
        raise SystemExit("repo_ref must be an immutable 40-character lowercase SHA")
    return normalized


def assert_nonsecret_command(command: str) -> None:
    upper = command.upper()
    bad = [marker for marker in SECRET_MARKERS if marker.upper() in upper]
    if bad:
        raise SystemExit("Refusing Run Command payload containing secret-bearing markers")


def smoke_command() -> str:
    command = """set -euo pipefail

test -d /opt/chess-studio
test -d /opt/chess-studio/repo
command -v docker >/dev/null
printf '%s\n' 'OCI_RUN_COMMAND_OK'
"""
    assert_nonsecret_command(command)
    return command


def deploy_command(repo_ref: str) -> str:
    sha = validate_sha(repo_ref)
    command = f"""set -euo pipefail
repo=/opt/chess-studio/repo
test -d \"$repo/.git\"
cd \"$repo\"
git fetch --no-tags --depth=1 origin '{sha}'
git checkout --detach '{sha}'
docker build -t chess-studio-backend:oci backend-python
if [[ ! -s /etc/chess-studio/backend.env ]]; then
  echo 'CHESS_STUDIO_RUNTIME_ENV_MISSING' >&2
  exit 42
fi
systemctl daemon-reload
systemctl restart chess-studio-backend.service
for attempt in {{1..60}}; do
  if curl --fail --silent --show-error --max-time 5 http://127.0.0.1:4000/api/ready >/dev/null; then
    printf '%s\n' 'CHESS_STUDIO_DEPLOY_OK repo_ref={sha}'
    exit 0
  fi
  sleep 2
done
echo 'CHESS_STUDIO_READY_TIMEOUT' >&2
exit 43
"""
    assert_nonsecret_command(command)
    return command


def config_from_env(oci: Any) -> dict[str, str]:
    config = {
        "tenancy": required_env("OCI_TENANCY_OCID"),
        "user": required_env("OCI_USER_OCID"),
        "fingerprint": required_env("OCI_FINGERPRINT"),
        "key_content": required_env("OCI_PRIVATE_KEY").replace("\r", ""),
        "region": os.environ.get("OCI_REGION", "eu-frankfurt-1").strip() or "eu-frankfurt-1",
    }
    oci.config.validate_config(config)
    return config


def resolve_staging(oci: Any, config: dict[str, str]) -> tuple[str, str]:
    identity = oci.identity.IdentityClient(config)
    compartments = oci.pagination.list_call_get_all_results(
        identity.list_compartments,
        config["tenancy"],
        access_level="ACCESSIBLE",
        compartment_id_in_subtree=True,
        name=COMPARTMENT_NAME,
        lifecycle_state="ACTIVE",
    ).data
    compartments = [row for row in compartments if row.name == COMPARTMENT_NAME]
    if len(compartments) != 1:
        raise SystemExit(
            f"Expected exactly one active compartment named {COMPARTMENT_NAME}; found {len(compartments)}"
        )
    compartment_id = compartments[0].id

    compute = oci.core.ComputeClient(config)
    instances = oci.pagination.list_call_get_all_results(
        compute.list_instances,
        compartment_id,
        display_name=INSTANCE_NAME,
        lifecycle_state="RUNNING",
    ).data
    instances = [row for row in instances if row.display_name == INSTANCE_NAME]
    if len(instances) != 1:
        raise SystemExit(
            f"Expected exactly one running instance named {INSTANCE_NAME}; found {len(instances)}"
        )
    return compartment_id, instances[0].id


def execute(oci: Any, config: dict[str, str], command: str, *, display_name: str, timeout: int = 180) -> None:
    assert_nonsecret_command(command)
    compartment_id, instance_id = resolve_staging(oci, config)
    models = oci.compute_instance_agent.models
    client = oci.compute_instance_agent.ComputeInstanceAgentClient(config)
    details = models.CreateInstanceAgentCommandDetails(
        compartment_id=compartment_id,
        execution_time_out_in_seconds=timeout,
        target=models.InstanceAgentCommandTarget(instance_id=instance_id),
        content=models.InstanceAgentCommandContent(
            source=models.InstanceAgentCommandSourceViaTextDetails(text=command),
            output=models.InstanceAgentCommandOutputViaTextDetails(output_type="TEXT"),
            command_string="/bin/bash",
        ),
        display_name=display_name,
    )
    created = client.create_instance_agent_command(
        create_instance_agent_command_details=details,
        retry_strategy=oci.retry.DEFAULT_RETRY_STRATEGY,
    ).data
    command_id = created.id
    deadline = time.monotonic() + timeout + 30
    last_state = ""
    while time.monotonic() < deadline:
        execution = client.get_instance_agent_command_execution(
            instance_agent_command_id=command_id,
            instance_id=instance_id,
            retry_strategy=oci.retry.DEFAULT_RETRY_STRATEGY,
        ).data
        state = str(execution.lifecycle_state or "UNKNOWN")
        if state != last_state:
            print(f"OCI Run Command state: {state}")
            last_state = state
        if state in TERMINAL_STATES:
            content = execution.content
            exit_code = getattr(content, "exit_code", None)
            text = (getattr(content, "text", "") or "").strip()
            message = (getattr(content, "message", "") or "").strip()
            if text:
                print(text[:4000])
            if state != "SUCCEEDED" or exit_code not in (None, 0):
                detail = message or text or "no command output"
                raise SystemExit(f"OCI Run Command failed: state={state} exit={exit_code} detail={detail[:500]}")
            return
        time.sleep(3)
    raise SystemExit("OCI Run Command polling timed out")


def self_test() -> None:
    sample = "0123456789abcdef0123456789abcdef01234567"
    assert validate_sha(sample) == sample
    try:
        validate_sha("main")
    except SystemExit:
        pass
    else:
        raise AssertionError("mutable refs must be rejected")
    smoke = smoke_command()
    deploy = deploy_command(sample)
    assert "OCI_RUN_COMMAND_OK" in smoke
    assert sample in deploy
    assert "/api/ready" in deploy
    for payload in (smoke, deploy):
        assert_nonsecret_command(payload)
    try:
        assert_nonsecret_command("JWT_SECRET=do-not-send")
    except SystemExit:
        pass
    else:
        raise AssertionError("secret-bearing command must be rejected")
    print("OCI Run Command self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", nargs="?", choices=("smoke", "deploy"))
    parser.add_argument("--repo-ref", default="")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        self_test()
        return 0
    if not args.operation:
        parser.error("operation is required unless --self-test is used")

    try:
        import oci  # type: ignore
    except ImportError as exc:
        raise SystemExit("OCI Python SDK is required: pip install oci") from exc

    config = config_from_env(oci)
    if args.operation == "smoke":
        execute(oci, config, smoke_command(), display_name="chess-studio-agent-smoke", timeout=120)
    else:
        execute(
            oci,
            config,
            deploy_command(args.repo_ref),
            display_name=f"chess-studio-deploy-{args.repo_ref[:12]}",
            timeout=900,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
