#!/usr/bin/env python3
"""Safely migrate the one-time OCI bootstrap state from local disk to the native OCI backend."""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

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


def state_fingerprint(payload: dict) -> tuple[str, tuple[str, ...]]:
    lineage = str(payload.get("lineage") or "")
    resources: list[str] = []
    for resource in payload.get("resources") or []:
        module = resource.get("module")
        prefix = f"{module}." if module else ""
        mode = "data." if resource.get("mode") == "data" else ""
        resources.append(f"{prefix}{mode}{resource.get('type')}.{resource.get('name')}")
    return lineage, tuple(sorted(resources))


def outputs_from_state(payload: dict) -> tuple[str, str]:
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


def migrate(stack: Path, *, region: str, key: str, dry_run: bool = False) -> None:
    local_state = stack / "terraform.tfstate"
    if not local_state.is_file():
        raise SystemExit("bootstrap migration requires an existing local terraform.tfstate from the one-time seed apply")
    if (stack / "backend.remote.tf").exists():
        raise SystemExit("backend.remote.tf already exists; use verify/configure instead of repeating local migration")

    payload = json.loads(local_state.read_text(encoding="utf-8"))
    before = state_fingerprint(payload)
    bucket, namespace = outputs_from_state(payload)
    rendered = backend_config(bucket=bucket, namespace=namespace, region=region, key=key)
    if dry_run:
        print(REMOTE_BACKEND_BLOCK, end="")
        print(rendered, end="")
        print(f"dry-run fingerprint: lineage={before[0] or '<none>'} resources={len(before[1])}")
        return

    backend_tf, backend_hcl = write_backend_files(
        stack, bucket=bucket, namespace=namespace, region=region, key=key
    )
    migrated = False
    try:
        run(
            [
                "terraform",
                "init",
                "-migrate-state",
                "-force-copy",
                f"-backend-config={backend_hcl.name}",
            ],
            cwd=stack,
        )
        remote = json.loads(run(["terraform", "state", "pull"], cwd=stack, capture=True).stdout)
        after = state_fingerprint(remote)
        if before != after:
            raise SystemExit(
                "remote bootstrap state fingerprint differs from the local seed; local state retained for recovery"
            )
        migrated = True
        cleanup_local_state(stack)
        print(
            f"OCI bootstrap state migrated and verified: {bucket}/{key} · "
            f"resources={len(after[1])} · local state removed"
        )
    finally:
        if not migrated and local_state.exists():
            backend_tf.unlink(missing_ok=True)
            print("migration failed before verification; removed backend.remote.tf and retained local state", file=sys.stderr)


def configure(stack: Path, *, bucket: str, namespace: str, region: str, key: str) -> None:
    write_backend_files(stack, bucket=bucket, namespace=namespace, region=region, key=key)
    print(f"OCI bootstrap remote backend configured: {bucket}/{key}")


def verify(stack: Path) -> None:
    local_files = [name for name in ("terraform.tfstate", "terraform.tfstate.backup") if (stack / name).exists()]
    if local_files:
        raise SystemExit("operational bootstrap must not retain local state: " + ", ".join(local_files))
    for name in ("backend.remote.tf", "backend.hcl"):
        if not (stack / name).is_file():
            raise SystemExit(f"missing generated remote backend file: {name}")
    run(["terraform", "init", "-reconfigure", "-backend-config=backend.hcl"], cwd=stack)
    remote = json.loads(run(["terraform", "state", "pull"], cwd=stack, capture=True).stdout)
    lineage, resources = state_fingerprint(remote)
    if not lineage or not resources:
        raise SystemExit("remote bootstrap state is unexpectedly empty")
    print(f"OCI bootstrap remote state verified: lineage={lineage} resources={len(resources)}")


def self_test() -> None:
    rendered = backend_config(bucket="state-bucket", namespace="ns123", region="eu-frankfurt-1")
    assert 'bucket    = "state-bucket"' in rendered
    assert 'namespace = "ns123"' in rendered
    assert 'key       = "chess-studio/bootstrap/terraform.tfstate"' in rendered
    assert "private_key" not in rendered and "fingerprint" not in rendered

    sample = {
        "lineage": "lineage-1",
        "outputs": {
            "state_bucket": {"value": "state-bucket"},
            "object_storage_namespace": {"value": "ns123"},
        },
        "resources": [
            {"mode": "managed", "type": "oci_identity_compartment", "name": "infra"},
            {"mode": "data", "type": "oci_objectstorage_namespace", "name": "this"},
        ],
    }
    assert outputs_from_state(sample) == ("state-bucket", "ns123")
    assert state_fingerprint(sample) == (
        "lineage-1",
        ("data.oci_objectstorage_namespace.this", "oci_identity_compartment.infra"),
    )

    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        stack = Path(tmp)
        backend_tf, backend_hcl = write_backend_files(
            stack,
            bucket="state-bucket",
            namespace="ns123",
            region="eu-frankfurt-1",
            key=DEFAULT_KEY,
        )
        assert backend_tf.read_text(encoding="utf-8") == REMOTE_BACKEND_BLOCK
        assert backend_hcl.read_text(encoding="utf-8") == rendered
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
