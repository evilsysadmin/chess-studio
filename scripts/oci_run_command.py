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
import shlex
import sys
import time
import uuid
from typing import Any

COMPARTMENT_NAME = "chess-studio-staging"
INSTANCE_NAME = "chess-studio-staging"
PLUGIN_NAME = "Compute Instance Run Command"
OPERATIONS = ("diagnose", "smoke", "reboot-agent", "deploy")
SHA_RE = re.compile(r"^[0-9a-f]{40}$")
SAFE_NAMESPACE_RE = re.compile(r"^[A-Za-z0-9_-]+$")
TERMINAL_STATES = {"SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELED"}
HEALTHY_PLUGIN_STATES = {"RUNNING"}
PLUGIN_REGISTRATION_TIMEOUT_SECONDS = 300
PLUGIN_REGISTRATION_RETRY_SECONDS = 5
PLUGIN_NOT_REGISTERED_MARKER = "Plugin Compute Instance Run Command not present for instance"
COMMAND_DELIVERY_GRACE_SECONDS = 300
RUN_COMMAND_INLINE_MAX_BYTES = 4096
SECRET_MARKERS = (
    "MONGO_URL=",
    "JWT_SECRET=",
    "RESEND_API_KEY=",
    "CHESS_AI_SHARED_SECRET=",
    "INVITE_CODE=",
    "PRIVATE KEY",
)
DEPLOY_WRAPPER = "/usr/local/sbin/chess-studio-deploy"
RUNTIME_WRAPPER = "/usr/local/sbin/chess-studio-install-runtime"
BACKEND_UNIT = "/etc/systemd/system/chess-studio-backend.service"
OCARUN_SUDOERS_SOURCE = "/etc/chess-studio/ocarun.sudoers"
OCARUN_SUDOERS = "/etc/sudoers.d/101-chess-studio-ocarun"
BOOTSTRAP_MARKER = "/opt/chess-studio/BOOTSTRAP_READY"
RUNTIME_BUCKET = "chess-studio-staging-runtime"
RUNTIME_OBJECT = "backend.env"
OCI_SDK_VERSION = "2.185.2"


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


def validate_namespace(value: str) -> str:
    normalized = value.strip()
    if not SAFE_NAMESPACE_RE.fullmatch(normalized):
        raise SystemExit("OCI Object Storage namespace is invalid")
    return normalized


def assert_nonsecret_command(command: str) -> None:
    upper = command.upper()
    bad = [marker for marker in SECRET_MARKERS if marker.upper() in upper]
    if bad:
        raise SystemExit("Refusing Run Command payload containing secret-bearing markers")


def plugin_status_is_healthy(status: str) -> bool:
    return status.strip().upper() in HEALTHY_PLUGIN_STATES


def safe_plugin_message(value: Any) -> str:
    text = str(value or "").replace("\r", " ").replace("\n", " ").strip()
    return text[:300]


def plugin_registration_is_pending(exc: BaseException) -> bool:
    """Retry only Oracle's not-yet-registered plugin condition."""
    status = getattr(exc, "status", None)
    text = str(exc).lower()
    return status == 404 or PLUGIN_NOT_REGISTERED_MARKER.lower() in text


def command_poll_budget(timeout: int) -> int:
    """Allow bounded delivery latency in addition to Oracle's execution timeout."""
    return timeout + COMMAND_DELIVERY_GRACE_SECONDS + 30


def smoke_command() -> str:
    command = f"""set -u

status=0
check() {{
  label="$1"
  shift
  if "$@"; then
    printf '%s\n' "OCI_HOST_CHECK_OK $label"
  else
    printf '%s\n' "OCI_HOST_CHECK_MISSING $label"
    status=1
  fi
}}

check root_dir test -d /opt/chess-studio
check repo_checkout test -d /opt/chess-studio/repo/.git
check bootstrap_marker test -s '{BOOTSTRAP_MARKER}'
check bootstrap_marker_sha grep -Eq '^CHESS_STUDIO_BOOTSTRAP_READY repo_ref=[0-9a-f]{{40}}$' '{BOOTSTRAP_MARKER}'
check deploy_wrapper test -x '{DEPLOY_WRAPPER}'
check runtime_wrapper test -x '{RUNTIME_WRAPPER}'
check backend_unit test -f '{BACKEND_UNIT}'
check ocarun_sudoers_source test -s '{OCARUN_SUDOERS_SOURCE}'
check sudoers_dir test -d /etc/sudoers.d
check install_binary command -v install
check sudo_binary command -v sudo
check visudo_binary command -v visudo
check ocarun_sudoers test -f '{OCARUN_SUDOERS}'
check docker_binary command -v docker
check docker_active systemctl is-active --quiet docker
if [[ "$status" -eq 0 ]]; then
  printf '%s\n' 'OCI_HOST_CONTRACT_OK'
fi
printf '%s\n' 'OCI_RUN_COMMAND_OK'
exit 0
"""
    assert_nonsecret_command(command)
    return command


def validate_smoke_output(text: str) -> None:
    lines = {line.strip() for line in text.splitlines() if line.strip()}
    if "OCI_RUN_COMMAND_OK" not in lines:
        raise SystemExit("OCI Run Command smoke did not return the transport success marker")
    if "OCI_HOST_CONTRACT_OK" in lines:
        return
    missing = sorted(
        line.removeprefix("OCI_HOST_CHECK_MISSING ")
        for line in lines
        if line.startswith("OCI_HOST_CHECK_MISSING ")
    )
    detail = ", ".join(missing) if missing else "unknown host-contract check"
    raise SystemExit(f"OCI host contract incomplete: {detail}")


def deploy_command(repo_ref: str, namespace: str) -> str:
    """Install the exact build identity privately, then deploy the immutable SHA.

    The Run Command payload contains only the non-secret SHA and Object Storage
    coordinates. The A1 fetches its existing secret-bearing backend.env with its
    instance principal, adds COMMIT_SHA locally, installs it through the existing
    privileged runtime wrapper, and only then restarts the exact release.
    """
    sha = validate_sha(repo_ref)
    namespace = validate_namespace(namespace)
    command = f"""set -euo pipefail

test -x '{DEPLOY_WRAPPER}' || {{ echo 'CHESS_STUDIO_DEPLOY_WRAPPER_MISSING' >&2; exit 44; }}
test -x '{RUNTIME_WRAPPER}' || {{ echo 'CHESS_STUDIO_RUNTIME_WRAPPER_MISSING' >&2; exit 45; }}
tmp="$(mktemp /tmp/chess-studio-backend.env.XXXXXX)"
trap 'rm -f "$tmp"' EXIT
venv="${{HOME:-/tmp}}/.cache/chess-studio-oci-runtime"
if [ ! -x "$venv/bin/python" ]; then
  python3 -m venv "$venv"
fi
if ! "$venv/bin/python" -c 'import oci; raise SystemExit(0 if oci.__version__ == "{OCI_SDK_VERSION}" else 1)' >/dev/null 2>&1; then
  "$venv/bin/python" -m pip install --disable-pip-version-check --quiet --upgrade 'oci=={OCI_SDK_VERSION}'
fi
RUNTIME_TMP="$tmp" RUNTIME_NAMESPACE={shlex.quote(namespace)} RUNTIME_SHA='{sha}' "$venv/bin/python" - <<'PY'
import os
from pathlib import Path
import oci

path = Path(os.environ["RUNTIME_TMP"])
sha = os.environ["RUNTIME_SHA"]
signer = oci.auth.signers.InstancePrincipalsSecurityTokenSigner()
client = oci.object_storage.ObjectStorageClient(config={{}}, signer=signer)
response = client.get_object(
    os.environ["RUNTIME_NAMESPACE"],
    "{RUNTIME_BUCKET}",
    "{RUNTIME_OBJECT}",
)
data = response.data.content.decode("utf-8")
if "\\x00" in data or "\\r" in data:
    raise SystemExit("invalid runtime object")
lines = []
for line in data.splitlines():
    if not line or "=" not in line:
        raise SystemExit("malformed runtime object")
    key, _ = line.split("=", 1)
    if key != "COMMIT_SHA":
        lines.append(line)
lines.append(f"COMMIT_SHA={{sha}}")
path.write_text("\\n".join(lines) + "\\n", encoding="utf-8")
os.chmod(path, 0o600)
PY
sudo --non-interactive '{RUNTIME_WRAPPER}' "$tmp"
trap - EXIT
sudo --non-interactive '{DEPLOY_WRAPPER}' '{sha}'
"""
    assert_nonsecret_command(command)
    if len(command.encode("utf-8")) > RUN_COMMAND_INLINE_MAX_BYTES:
        raise SystemExit("OCI deploy payload exceeds Run Command inline limit")
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


def runtime_namespace(oci: Any, config: dict[str, str]) -> str:
    client = oci.object_storage.ObjectStorageClient(config)
    namespace = client.get_namespace(
        compartment_id=config["tenancy"],
        retry_strategy=oci.retry.DEFAULT_RETRY_STRATEGY,
    ).data
    return validate_namespace(str(namespace or ""))


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


def read_plugin_observation(
    oci: Any,
    config: dict[str, str],
    compartment_id: str,
    instance_id: str,
) -> tuple[str, Any, str]:
    client = oci.compute_instance_agent.PluginClient(config)
    observed = client.get_instance_agent_plugin(
        instanceagent_id=instance_id,
        compartment_id=compartment_id,
        plugin_name=PLUGIN_NAME,
        retry_strategy=oci.retry.DEFAULT_RETRY_STRATEGY,
    ).data
    return (
        str(getattr(observed, "status", None) or "UNKNOWN").upper(),
        getattr(observed, "time_last_updated_utc", None),
        safe_plugin_message(getattr(observed, "message", "")),
    )


def diagnose_plugin(
    oci: Any,
    config: dict[str, str],
    *,
    wait_for_registration: bool = False,
    registration_timeout: int = PLUGIN_REGISTRATION_TIMEOUT_SECONDS,
    resolved: tuple[str, str] | None = None,
    include_egress_diagnostic: bool = False,
) -> str:
    compartment_id, instance_id = resolved or resolve_staging(oci, config)
    compute = oci.core.ComputeClient(config)
    instance = compute.get_instance(
        instance_id,
        retry_strategy=oci.retry.DEFAULT_RETRY_STRATEGY,
    ).data
    agent = instance.agent_config
    configured_plugins = getattr(agent, "plugins_config", None) or []
    desired = next(
        (
            str(plugin.desired_state or "UNKNOWN")
            for plugin in configured_plugins
            if str(plugin.name or "") == PLUGIN_NAME
        ),
        "UNSPECIFIED",
    )
    print(
        "OCI Run Command desired: "
        f"state={desired} "
        f"management_disabled={getattr(agent, 'is_management_disabled', None)} "
        f"all_plugins_disabled={getattr(agent, 'are_all_plugins_disabled', None)}",
        flush=True,
    )

    deadline = time.monotonic() + max(0, registration_timeout)
    attempt = 0
    while True:
        attempt += 1
        try:
            status, updated, message = read_plugin_observation(
                oci, config, compartment_id, instance_id
            )
            break
        except oci.exceptions.ServiceError as exc:
            if not wait_for_registration or not plugin_registration_is_pending(exc):
                raise
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise SystemExit(
                    "OCI Run Command plugin registration timed out after "
                    f"{registration_timeout}s"
                ) from exc
            print(
                "OCI Run Command plugin not registered yet "
                f"(attempt {attempt}); retrying in {PLUGIN_REGISTRATION_RETRY_SECONDS}s",
                flush=True,
            )
            time.sleep(min(PLUGIN_REGISTRATION_RETRY_SECONDS, remaining))

    print(f"OCI Run Command observed: status={status} last_updated={updated}", flush=True)
    if message:
        print(f"OCI Run Command observed message: {message}", flush=True)
    if not plugin_status_is_healthy(status):
        raise SystemExit(f"OCI Run Command plugin is not running: status={status}")

    if include_egress_diagnostic:
        # Reserved-egress details are diagnostic control-plane state, not part of
        # every immutable backend release. Keep them available on explicit
        # diagnose without paying the VNIC lookup cost on deploy/smoke.
        try:
            from oci_egress_diagnose import DEFAULT_EXPECTED_IPV4, assigned_public_ipv4

            assigned = assigned_public_ipv4(oci, config)
            print(f"OCI_VNIC_PUBLIC_IPV4={assigned}", flush=True)
            print(f"OCI_EGRESS_EXPECTED_IPV4={DEFAULT_EXPECTED_IPV4}", flush=True)
            print(
                f"OCI_VNIC_MATCH_EXPECTED={'yes' if assigned == DEFAULT_EXPECTED_IPV4 else 'no'}",
                flush=True,
            )
        except BaseException as exc:
            print(
                f"OCI_EGRESS_DIAGNOSTIC_ERROR={type(exc).__name__}:{str(exc)[:240]}",
                flush=True,
            )
    return status


def reboot_agent(oci: Any, config: dict[str, str], *, timeout: int = 600) -> None:
    compartment_id, instance_id = resolve_staging(oci, config)
    before_status, before_updated, before_message = read_plugin_observation(
        oci, config, compartment_id, instance_id
    )
    print(
        f"OCI agent recovery: before status={before_status} last_updated={before_updated}",
        flush=True,
    )
    if before_message:
        print(f"OCI agent recovery: before message={before_message}", flush=True)

    compute = oci.core.ComputeClient(config)
    compute.instance_action(
        instance_id=instance_id,
        action="SOFTRESET",
        opc_retry_token=str(uuid.uuid4()),
        retry_strategy=oci.retry.DEFAULT_RETRY_STRATEGY,
    )
    print("OCI agent recovery: SOFTRESET requested", flush=True)

    deadline = time.monotonic() + timeout
    last_instance_state = ""
    last_plugin_marker: tuple[str, str] | None = None
    while time.monotonic() < deadline:
        try:
            instance = compute.get_instance(
                instance_id,
                retry_strategy=oci.retry.DEFAULT_RETRY_STRATEGY,
            ).data
            instance_state = str(instance.lifecycle_state or "UNKNOWN")
            if instance_state != last_instance_state:
                print(f"OCI agent recovery: instance state={instance_state}", flush=True)
                last_instance_state = instance_state

            status, updated, message = read_plugin_observation(
                oci, config, compartment_id, instance_id
            )
            marker = (status, str(updated))
            if marker != last_plugin_marker:
                print(
                    f"OCI agent recovery: plugin status={status} last_updated={updated}",
                    flush=True,
                )
                if message:
                    print(f"OCI agent recovery: plugin message={message}", flush=True)
                last_plugin_marker = marker
            if (
                instance_state == "RUNNING"
                and plugin_status_is_healthy(status)
                and str(updated) != str(before_updated)
            ):
                print("OCI agent recovery: plugin refreshed after SOFTRESET", flush=True)
                return
        except oci.exceptions.ServiceError as exc:
            if exc.status not in {404, 409, 429, 500, 502, 503, 504}:
                raise
            print(f"OCI agent recovery: transient API status={exc.status}", flush=True)
        time.sleep(5)
    raise SystemExit("OCI agent recovery timed out waiting for refreshed RUNNING plugin")


def build_command_content(models: Any, command: str) -> Any:
    """Use Oracle's default Linux Bash runner for inline text scripts."""
    assert_nonsecret_command(command)
    return models.InstanceAgentCommandContent(
        source=models.InstanceAgentCommandSourceViaTextDetails(text=command),
        output=models.InstanceAgentCommandOutputViaTextDetails(output_type="TEXT"),
    )


def bounded_command_output(text: str, *, head_chars: int = 2000, tail_chars: int = 2000) -> str:
    """Keep useful start/end diagnostics without increasing the previous 4K log cap."""
    if len(text) <= head_chars + tail_chars:
        return text
    omitted = len(text) - head_chars - tail_chars
    return (
        text[:head_chars]
        + f"\n... OCI Run Command output omitted chars={omitted} ...\n"
        + text[-tail_chars:]
    )


def execute(
    oci: Any,
    config: dict[str, str],
    command: str,
    *,
    display_name: str,
    timeout: int = 180,
    resolved: tuple[str, str] | None = None,
) -> str:
    assert_nonsecret_command(command)
    compartment_id, instance_id = resolved or resolve_staging(oci, config)
    models = oci.compute_instance_agent.models
    client = oci.compute_instance_agent.ComputeInstanceAgentClient(config)
    details = models.CreateInstanceAgentCommandDetails(
        compartment_id=compartment_id,
        execution_time_out_in_seconds=timeout,
        target=models.InstanceAgentCommandTarget(instance_id=instance_id),
        content=build_command_content(models, command),
        display_name=display_name,
    )
    created = client.create_instance_agent_command(
        create_instance_agent_command_details=details,
        retry_strategy=oci.retry.DEFAULT_RETRY_STRATEGY,
    ).data
    command_id = created.id
    deadline = time.monotonic() + command_poll_budget(timeout)
    last_state = ""
    while time.monotonic() < deadline:
        execution = client.get_instance_agent_command_execution(
            instance_agent_command_id=command_id,
            instance_id=instance_id,
            retry_strategy=oci.retry.DEFAULT_RETRY_STRATEGY,
        ).data
        state = str(execution.lifecycle_state or "UNKNOWN")
        if state != last_state:
            print(f"OCI Run Command state: {state}", flush=True)
            last_state = state
        if state in TERMINAL_STATES:
            content = execution.content
            exit_code = getattr(content, "exit_code", None)
            text = (getattr(content, "text", "") or "").strip()
            message = (getattr(content, "message", "") or "").strip()
            if text:
                print(bounded_command_output(text), flush=True)
            if state != "SUCCEEDED" or exit_code not in (None, 0):
                detail = message or text or "no command output"
                raise SystemExit(f"OCI Run Command failed: state={state} exit={exit_code} detail={detail[:500]}")
            return text
        time.sleep(3)
    raise SystemExit("OCI Run Command polling timed out waiting for delivery/execution")


def self_test() -> None:
    sample = "0123456789abcdef0123456789abcdef01234567"
    assert validate_sha(sample) == sample
    try:
        validate_sha("main")
    except SystemExit:
        pass
    else:
        raise AssertionError("mutable refs must be rejected")
    assert validate_namespace("sample_namespace-1") == "sample_namespace-1"
    try:
        validate_namespace("bad namespace")
    except SystemExit:
        pass
    else:
        raise AssertionError("unsafe Object Storage namespace must be rejected")
    assert OPERATIONS == ("diagnose", "smoke", "reboot-agent", "deploy")
    assert PLUGIN_REGISTRATION_TIMEOUT_SECONDS == 300
    assert PLUGIN_REGISTRATION_RETRY_SECONDS == 5
    assert command_poll_budget(120) == 450
    assert plugin_status_is_healthy("RUNNING")
    assert plugin_status_is_healthy(" running ")
    assert not plugin_status_is_healthy("STOPPED")
    assert not plugin_status_is_healthy("NOT_SUPPORTED")
    assert not plugin_status_is_healthy("INVALID")
    assert safe_plugin_message("line one\nline two") == "line one line two"
    bounded = bounded_command_output("A" * 2500 + "TAIL_MARKER", head_chars=1000, tail_chars=1000)
    assert len(bounded) < 2100
    assert bounded.startswith("A" * 1000)
    assert "omitted chars=" in bounded
    assert bounded.endswith("TAIL_MARKER")

    class MissingPluginError(Exception):
        status = 404

    class PhraseOnlyPluginError(Exception):
        status = 400

    class OtherPluginError(Exception):
        status = 500

    assert plugin_registration_is_pending(MissingPluginError("not found"))
    assert plugin_registration_is_pending(PhraseOnlyPluginError(PLUGIN_NOT_REGISTERED_MARKER))
    assert not plugin_registration_is_pending(OtherPluginError("temporary service error"))

    smoke = smoke_command()
    deploy = deploy_command(sample, "sample_namespace")
    assert "OCI_HOST_CONTRACT_OK" in smoke
    assert "OCI_RUN_COMMAND_OK" in smoke
    assert "OCI_HOST_CHECK_MISSING" in smoke
    validate_smoke_output("OCI_HOST_CONTRACT_OK\nOCI_RUN_COMMAND_OK")
    try:
        validate_smoke_output("OCI_HOST_CHECK_MISSING bootstrap_marker\nOCI_RUN_COMMAND_OK")
    except SystemExit as exc:
        assert "bootstrap_marker" in str(exc)
    else:
        raise AssertionError("missing host contract must fail after diagnostic output")
    for expected in (
        DEPLOY_WRAPPER,
        RUNTIME_WRAPPER,
        BACKEND_UNIT,
        OCARUN_SUDOERS_SOURCE,
        OCARUN_SUDOERS,
        BOOTSTRAP_MARKER,
        "check sudoers_dir test -d /etc/sudoers.d",
        "check install_binary command -v install",
        "check sudo_binary command -v sudo",
        "check visudo_binary command -v visudo",
        "systemctl is-active --quiet docker",
    ):
        assert expected in smoke
    assert DEPLOY_WRAPPER in deploy
    assert RUNTIME_WRAPPER in deploy
    assert RUNTIME_BUCKET in deploy
    assert RUNTIME_OBJECT in deploy
    assert "InstancePrincipalsSecurityTokenSigner" in deploy
    assert "COMMIT_SHA" in deploy
    assert "sudo --non-interactive" in deploy
    assert f'oci.__version__ == "{OCI_SDK_VERSION}"' in deploy
    assert '"$venv/bin/python" -m pip install' in deploy
    assert sample in deploy
    assert len(deploy.encode("utf-8")) <= RUN_COMMAND_INLINE_MAX_BYTES
    assert "docker build" not in deploy
    assert "systemctl restart" not in deploy
    for payload in (smoke, deploy):
        assert_nonsecret_command(payload)
    try:
        assert_nonsecret_command("JWT_SECRET=do-not-send")
    except SystemExit:
        pass
    else:
        raise AssertionError("secret-bearing command must be rejected")

    class Capture:
        def __init__(self, **kwargs: Any) -> None:
            self.kwargs = kwargs

    class FakeModels:
        InstanceAgentCommandContent = Capture
        InstanceAgentCommandSourceViaTextDetails = Capture
        InstanceAgentCommandOutputViaTextDetails = Capture

    command_content = build_command_content(FakeModels, smoke)
    assert "command_string" not in command_content.kwargs
    assert command_content.kwargs["source"].kwargs["text"] == smoke
    assert command_content.kwargs["output"].kwargs["output_type"] == "TEXT"
    print("OCI Run Command self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", nargs="?", choices=OPERATIONS)
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
    if args.operation == "diagnose":
        diagnose_plugin(oci, config, include_egress_diagnostic=True)
    elif args.operation == "reboot-agent":
        reboot_agent(oci, config)
    elif args.operation == "smoke":
        resolved = resolve_staging(oci, config)
        diagnose_plugin(oci, config, resolved=resolved)
        output = execute(
            oci,
            config,
            smoke_command(),
            display_name="chess-studio-agent-smoke",
            timeout=120,
            resolved=resolved,
        )
        validate_smoke_output(output)
    else:
        resolved = resolve_staging(oci, config)
        diagnose_plugin(
            oci,
            config,
            wait_for_registration=True,
            resolved=resolved,
        )
        namespace = runtime_namespace(oci, config)
        execute(
            oci,
            config,
            deploy_command(args.repo_ref, namespace),
            display_name=f"chess-studio-deploy-{args.repo_ref[:12]}",
            timeout=900,
            resolved=resolved,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
