#!/usr/bin/env python3
"""Small OCI operator helper for the canonical Chess Studio A1 instance."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys


def run_oci(profile: str, auth: str, *args: str) -> dict:
    cmd = ["oci", *args, "--profile", profile, "--auth", auth, "--output", "json"]
    try:
        completed = subprocess.run(
            cmd,
            check=True,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
    except FileNotFoundError:
        raise SystemExit("ERROR: OCI CLI no está instalado o no está en PATH.")
    except subprocess.CalledProcessError as exc:
        if exc.stderr:
            sys.stderr.write(exc.stderr)
        raise SystemExit(exc.returncode)
    return json.loads(completed.stdout)


def discover_instance(profile: str, auth: str, name: str) -> dict:
    query = f"query instance resources where displayName = '{name}'"
    payload = run_oci(
        profile,
        auth,
        "search",
        "resource",
        "structured-search",
        "--query-text",
        query,
    )
    items = payload.get("data", {}).get("items", [])
    if not items:
        raise SystemExit(f"ERROR: no encuentro una instancia OCI llamada {name!r}.")
    if len(items) > 1:
        raise SystemExit(
            f"ERROR: encontré {len(items)} instancias llamadas {name!r}; "
            "haz el nombre único o especifica OCI_INSTANCE_NAME."
        )
    return items[0]


def instance_details(profile: str, auth: str, name: str) -> dict:
    found = discover_instance(profile, auth, name)
    instance_id = found["identifier"]
    return run_oci(profile, auth, "compute", "instance", "get", "--instance-id", instance_id)["data"]


def public_ip(profile: str, auth: str, instance: dict) -> str:
    attachments = run_oci(
        profile,
        auth,
        "compute",
        "vnic-attachment",
        "list",
        "--compartment-id",
        instance["compartment-id"],
        "--instance-id",
        instance["id"],
    )["data"]
    if not attachments:
        raise SystemExit("ERROR: la A1 no tiene VNIC attachments.")
    primary = next((item for item in attachments if item.get("lifecycle-state") == "ATTACHED"), attachments[0])
    vnic = run_oci(
        profile,
        auth,
        "network",
        "vnic",
        "get",
        "--vnic-id",
        primary["vnic-id"],
    )["data"]
    ip = vnic.get("public-ip")
    if not ip:
        raise SystemExit("ERROR: la A1 no tiene IP pública en su VNIC.")
    return ip


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("info", "status", "ip", "ssh"))
    parser.add_argument("--profile", default=os.environ.get("OCI_CLI_PROFILE", "DEFAULT"))
    parser.add_argument("--auth", default=os.environ.get("OCI_CLI_AUTH", "security_token"))
    parser.add_argument("--name", default=os.environ.get("OCI_INSTANCE_NAME", "chess-studio-staging"))
    parser.add_argument("--ssh-user", default=os.environ.get("OCI_SSH_USER", "ubuntu"))
    parser.add_argument("--ssh-key", default=os.environ.get("OCI_SSH_KEY", ""))
    parser.add_argument("--ssh-hostname", default=os.environ.get("OCI_SSH_HOSTNAME", "ssh-staging.chess-studio.shadowops.dpdns.org"))
    args = parser.parse_args()

    if args.action == "ssh":
        cloudflared = shutil.which("cloudflared")
        if not cloudflared:
            raise SystemExit("ERROR: cloudflared no está instalado o no está en PATH.")
        ssh = shutil.which("ssh")
        if not ssh:
            raise SystemExit("ERROR: ssh no está instalado o no está en PATH.")
        cmd = [ssh, "-o", f"ProxyCommand={cloudflared} access ssh --hostname %h"]
        if args.ssh_key:
            cmd.extend(["-i", os.path.expanduser(args.ssh_key)])
        cmd.append(f"{args.ssh_user}@{args.ssh_hostname}")
        print(f"==> SSH {args.ssh_user}@{args.ssh_hostname} via Cloudflare Tunnel", file=sys.stderr)
        os.execv(ssh, cmd)

    instance = instance_details(args.profile, args.auth, args.name)

    if args.action == "status":
        print(instance.get("lifecycle-state", "UNKNOWN"))
        return 0

    if args.action == "ip":
        print(public_ip(args.profile, args.auth, instance))
        return 0

    info = {
        "name": instance.get("display-name"),
        "state": instance.get("lifecycle-state"),
        "shape": instance.get("shape"),
        "ocpus": (instance.get("shape-config") or {}).get("ocpus"),
        "memory_gb": (instance.get("shape-config") or {}).get("memory-in-gbs"),
        "availability_domain": instance.get("availability-domain"),
        "compartment_id": instance.get("compartment-id"),
        "instance_id": instance.get("id"),
        "public_ip": public_ip(args.profile, args.auth, instance),
    }
    print(json.dumps(info, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
