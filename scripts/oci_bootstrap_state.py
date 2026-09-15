#!/usr/bin/env python3
"""Safely migrate the one-time OCI bootstrap state from local disk to the native OCI backend."""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_STACK = ROOT / "infra" / "oci" / "bootstrap"
DEFAULT_KEY = "chess-studio/bootstrap/terraform.tfstate"
REMOTE_BACKEND_BLOCK = 'terraform {\n  backend "oci" {}\n}\n'


def hcl_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=True)


def backend_config(*, bucket: str, namespace: str, region: str, key: str = DEFAULT_KEY) -> str:
    values = {
        "bucket": bucket,
        "namespace": namespace,
        "key": key,
        "region": region,
    }
    if any(not value.strip() for value in values.values()):
        raise ValueError("backend values must be non-empty")
    return "".join(f"{name:<9} = {hcl_string(value)}\n" for name, value in values.items())


def resource_identity(payload: dict[str, Any]) -> tuple[tuple[str, str, str], ...]:
    resources: list[tuple[str, str, str]] = []
    for resource in payload.get("resources") or []:
        module = resource.get("module")
        prefix = f"{module}." if module else ""
        mode = "data." if resource.get("mode") == "data" else ""
        address = f"{prefix}{mode}{resource.get('type')}.{resource.get('name')}"
        instances = resource.get("instances") or [{}]
        for instance in instances:
            index_key = instance.get("index_key")
            attrs = instance.get("attributes") or {}
            resource_id = attrs.get("id")
            resources.append((address, json.dumps(index_key, sort_keys=True), str(resource_id or "")))
    return tuple(sorted(resources))


def state_signature(payload: dict[str, Any]) -> dict[str, Any]:
    outputs = {
        name: {
            "value": value.get("value"),
            "sensitive": bool(value.get("sensitive", False)),
        }
        for name, value in sorted((payload.get("outputs") or {}).items())
    }
    return {
        "lineage": str(payload.get("lineage") or ""),
        "serial": int(payload.get("serial") or 0),
        "outputs": outputs,
        "resources": resource_identity(payload),
    }


def outputs_from_state(payload: dict[str, Any]) -> tuple[str, str]:
    outputs = payload.get("outputs") or {}
    try:
        bucket = str(outputs["state_bucket"]["value"])
        namespace = str(outputs["object_storage_namespace"]["value"])
    except (KeyError, TypeError) as exc:
        raise ValueError("local bootstrap state lacks state_bucket/object_storage_namespace outputs") from exc
    if not bucket or not namespace:
        raise ValueError("bootstrap backend outputs must be non-empty")
    return bucket, namespace


def write_backend_files(stack: Path, *, bucket: str, namespace: str, region: str, key: str) -> tuple[Path, Path]:
    backend_tf = stack / "backend.remote.tf"
    backend_hcl = stack / "backend.hcl"
    backend_tf.write_text(REMOTE_BACKEND_BLOCK, encoding="utf-8")
    backend_hcl.write_text(backend_config(bucket=bucket, namespace=namespace, region=region, key=key), encoding="utf-8")
    return backend_tf, backend_hcl


def run(command: list[str], *, cwd: Path, capture: bool = False) -> subprocess.CompletedProcess[str]:
    print("+", " ".join(command))
    return subprocess.run(command, cwd=cwd, check=True, text=True, capture_output=capture)


def cleanup_local_state(stack: Path) -> None:
    for name in ("terraform.tfstate", "terraform.tfstate.backup"):
        path = stack / name
        if path.exists():
            path.unlink()


def read_state(path: Path, *, label: str) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"cannot read {label} Terraform state: {exc}") from exc
    if not isinstance(payload, dict):
        raise SystemExit(f"{label} Terraform state is not a JSON object")
    return payload


def migrate(stack: Path, *, region: str, key: str, dry_run: bool = False) -> None:
    local_state = stack / "terraform.tfstate"
    backend_tf = stack / "backend.remote.tf"
    backend_hcl = stack / "backend.hcl"
    if not local_state.is_file():
        raise SystemExit("bootstrap migration requires an existing local terraform.tfstate from the one-time seed apply")
    if backend_tf.exists():
        raise SystemExit("backend.remote.tf already exists; use verify/configure instead of repeating local migration")

    payload = read_state(local_state, label="local bootstrap")
    before = state_signature(payload)
    if not before["lineage"] or not before["resources"]:
        raise SystemExit("local bootstrap state is unexpectedly empty; refusing migration")
    bucket, namespace = outputs_from_state(payload)
    rendered = backend_config(bucket=bucket, namespace=namespace, region=region, key=key)
    if dry_run:
        print(REMOTE_BACKEND_BLOCK, end="")
        print(rendered, end="")
        print(
            f"dry-run signature: lineage={before['lineage']} serial={before['serial']} "
            f"resources={len(before['resources'])}"
        )
        return

    write_backend_files(stack, bucket=bucket, namespace=namespace, region=region, key=key)
    backend_initialized = False
    verified = False
    try:
        run(
            [
                "terraform",
                "init",
                "-migrate-state",
                "-force-copy",
                "-input=false",
                f"-backend-config={backend_hcl.name}",
            ],
            cwd=stack,
        )
        backend_initialized = True
        pulled = run(["terraform", "state", "pull"], cwd=stack, capture=True).stdout
        try:
            remote = json.loads(pulled)
        except json.JSONDecodeError as exc:
            raise SystemExit(f"remote bootstrap state is not valid JSON: {exc}") from exc
        after = state_signature(remote)
        if before != after:
            raise SystemExit(
                "remote bootstrap state differs from the local seed after migration; "
                "local state and backend config were retained for recovery"
            )
        verified = True
        cleanup_local_state(stack)
        print(
            f"OCI bootstrap state migrated and verified: {bucket}/{key} · "
            f"lineage={after['lineage']} · serial={after['serial']} · "
            f"resources={len(after['resources'])} · local state removed"
        )
    finally:
        if verified:
            return
        if backend_initialized:
            print(
                "migration reached the remote backend but verification did not finish; "
                "retaining local state + backend.remote.tf/backend.hcl to prevent split-brain",
                file=sys.stderr,
            )
        else:
            backend_tf.unlink(missing_ok=True)
            backend_hcl.unlink(missing_ok=True)
            print(
                "migration failed before remote backend initialization; generated backend files removed and local state retained",
                file=sys.stderr,
            )


def configure(stack: Path, *, bucket: str, namespace: str, region: str, key: str) -> None:
    if any((stack / name).exists() for name in ("terraform.tfstate", "terraform.tfstate.backup")):
        raise SystemExit("refusing remote configure while local bootstrap state exists; migrate it first")
    write_backend_files(stack, bucket=bucket, namespace=namespace, region=region, key=key)
    print(f"OCI bootstrap remote backend configured: {bucket}/{key}")


def verify(stack: Path) -> None:
    local_files = [name for name in ("terraform.tfstate", "terraform.tfstate.backup") if (stack / name).exists()]
    if local_files:
        raise SystemExit("operational bootstrap must not retain local state: " + ", ".join(local_files))
    for name in ("backend.remote.tf", "backend.hcl"):
        if not (stack / name).is_file():
            raise SystemExit(f"missing generated remote backend file: {name}")
    run(["terraform", "init", "-reconfigure", "-input=false", "-backend-config=backend.hcl"], cwd=stack)
    pulled = run(["terraform", "state", "pull"], cwd=stack, capture=True).stdout
    try:
        remote = json.loads(pulled)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"remote bootstrap state is not valid JSON: {exc}") from exc
    signature = state_signature(remote)
    if not signature["lineage"] or not signature["resources"]:
        raise SystemExit("remote bootstrap state is unexpectedly empty")
    print(
        f"OCI bootstrap remote state verified: lineage={signature['lineage']} "
        f"serial={signature['serial']} resources={len(signature['resources'])}"
    )


def self_test() -> None:
    rendered = backend_config(bucket="state-bucket", namespace="ns123", region="eu-frankfurt-1")
    assert 'bucket    = "state-bucket"' in rendered
    assert 'namespace = "ns123"' in rendered
    assert 'key       = "chess-studio/bootstrap/terraform.tfstate"' in rendered
    assert 'region    = "eu-frankfurt-1"' in rendered
    assert "private_key" not in rendered and "fingerprint" not in rendered

    sample = {
        "lineage": "lineage-1",
        "serial": 7,
        "outputs": {
            "state_bucket": {"value": "state-bucket", "sensitive": False},
            "object_storage_namespace": {"value": "ns123", "sensitive": False},
        },
        "resources": [
            {
                "mode": "managed",
                "type": "oci_identity_compartment",
                "name": "infra",
                "instances": [{"attributes": {"id": "ocid1.compartment.test"}}],
            },
            {
                "mode": "data",
                "type": "oci_objectstorage_namespace",
                "name": "this",
                "instances": [{"attributes": {"id": "namespace-ds"}}],
            },
        ],
    }
    assert outputs_from_state(sample) == ("state-bucket", "ns123")
    signature = state_signature(sample)
    assert signature["lineage"] == "lineage-1"
    assert signature["serial"] == 7
    assert signature["resources"] == (
        ("data.oci_objectstorage_namespace.this", "null", "namespace-ds"),
        ("oci_identity_compartment.infra", "null", "ocid1.compartment.test"),
    )

    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        stack = Path(tmp)
        backend_tf, generated_hcl = write_backend_files(
            stack,
            bucket="state-bucket",
            namespace="ns123",
            region="eu-frankfurt-1",
            key=DEFAULT_KEY,
        )
        assert backend_tf.read_text(encoding="utf-8") == REMOTE_BACKEND_BLOCK
        assert generated_hcl.read_text(encoding="utf-8") == rendered
        (stack / "terraform.tfstate").write_text("{}", encoding="utf-8")
        (stack / "terraform.tfstate.backup").write_text("{}", encoding="utf-8")
        cleanup_local_state(stack)
        assert not (stack / "terraform.tfstate").exists()
        assert not (stack / "terraform.tfstate.backup").exists()
    print("oci-bootstrap-state self-test: OK")


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser()
    result.add_argument("--self-test", action="store_true")
    result.add_argument("--stack", type=Path, default=DEFAULT_STACK)
    sub = result.add_subparsers(dest="command")

    migrate_parser = sub.add_parser("migrate")
    migrate_parser.add_argument("--region", default="eu-frankfurt-1")
    migrate_parser.add_argument("--key", default=DEFAULT_KEY)
    migrate_parser.add_argument("--dry-run", action="store_true")

    configure_parser = sub.add_parser("configure")
    configure_parser.add_argument("--bucket", required=True)
    configure_parser.add_argument("--namespace", required=True)
    configure_parser.add_argument("--region", default="eu-frankfurt-1")
    configure_parser.add_argument("--key", default=DEFAULT_KEY)

    sub.add_parser("verify")
    return result


def main() -> int:
    args = parser().parse_args()
    if args.self_test:
        self_test()
        return 0
    stack = args.stack.resolve()
    if args.command == "migrate":
        migrate(stack, region=args.region, key=args.key, dry_run=args.dry_run)
    elif args.command == "configure":
        configure(stack, bucket=args.bucket, namespace=args.namespace, region=args.region, key=args.key)
    elif args.command == "verify":
        verify(stack)
    else:
        parser().print_help()
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
