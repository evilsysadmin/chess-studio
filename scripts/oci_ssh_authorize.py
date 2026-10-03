#!/usr/bin/env python3
"""Authorize the local operator SSH public key on OCI staging via Run Command."""

from __future__ import annotations

import argparse
import base64
import json
import os
from pathlib import Path
import re
import time

from oci_a1 import instance_details, run_oci

TERMINAL_STATES = {"SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELED"}
KEY_RE = re.compile(
    r"^(ssh-ed25519|ssh-rsa|ecdsa-sha2-[A-Za-z0-9@._+-]+|"
    r"sk-ssh-ed25519@openssh\.com|sk-ecdsa-sha2-nistp256@openssh\.com) "
    r"([A-Za-z0-9+/]+={0,3})(?: .*)?$"
)


def choose_public_key(explicit: str, private_key: str) -> Path:
    candidates: list[Path] = []
    if explicit:
        candidates.append(Path(explicit).expanduser())
    elif private_key:
        candidates.append(Path(private_key + ".pub").expanduser())
    else:
        candidates.extend(
            [
                Path("~/.ssh/id_ed25519.pub").expanduser(),
                Path("~/.ssh/id_ecdsa.pub").expanduser(),
                Path("~/.ssh/id_rsa.pub").expanduser(),
            ]
        )
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    rendered = ", ".join(str(path) for path in candidates) or "<none>"
    raise SystemExit(
        "ERROR: no encuentro una clave pública SSH local. "
        f"Probé: {rendered}. Define OCI_SSH_PUBLIC_KEY=/ruta/clave.pub."
    )


def read_public_key(path: Path) -> str:
    raw = path.read_text(encoding="utf-8")
    if "\x00" in raw or "\r" in raw or "PRIVATE KEY" in raw.upper():
        raise SystemExit("ERROR: OCI_SSH_PUBLIC_KEY debe apuntar a una clave pública OpenSSH, nunca privada.")
    lines = [line.strip() for line in raw.splitlines() if line.strip()]
    if len(lines) != 1 or not KEY_RE.fullmatch(lines[0]):
        raise SystemExit("ERROR: la clave pública debe contener exactamente una clave OpenSSH soportada.")
    return lines[0]


def authorize_command(public_key: str) -> str:
    encoded = base64.b64encode((public_key + "\n").encode("utf-8")).decode("ascii")
    return f"""set -euo pipefail
test -x /usr/local/sbin/chess-studio-ssh-authorize || {{
  echo CHESS_STUDIO_SSH_AUTHORIZE_WRAPPER_MISSING >&2
  exit 44
}}
umask 077
tmp="$(mktemp /tmp/chess-studio-operator-key.XXXXXX)"
trap 'rm -f "$tmp"' EXIT
printf '%s' '{encoded}' | base64 --decode > "$tmp"
sudo --non-interactive /usr/local/sbin/chess-studio-ssh-authorize "$tmp"
"""


def create_run_command(profile: str, auth: str, instance: dict, command: str) -> str:
    payload = run_oci(
        profile,
        auth,
        "instance-agent",
        "command",
        "create",
        "--compartment-id",
        instance["compartment-id"],
        "--content",
        json.dumps(
            {
                "source": {"sourceType": "TEXT", "text": command},
                "output": {"outputType": "TEXT"},
            },
            separators=(",", ":"),
        ),
        "--target",
        json.dumps({"instanceId": instance["id"]}, separators=(",", ":")),
        "--timeout-in-seconds",
        "90",
        "--display-name",
        "Chess Studio authorize operator SSH key",
    )
    command_id = payload.get("data", {}).get("id")
    if not command_id:
        raise SystemExit("ERROR: OCI no devolvió un command id para la autorización SSH.")
    return str(command_id)


def wait_execution(profile: str, auth: str, instance_id: str, command_id: str) -> str:
    deadline = time.monotonic() + 360
    last_state = ""
    while time.monotonic() < deadline:
        payload = run_oci(
            profile,
            auth,
            "instance-agent",
            "command-execution",
            "get",
            "--command-id",
            command_id,
            "--instance-id",
            instance_id,
        )
        data = payload.get("data", {})
        state = str(data.get("lifecycle-state") or "UNKNOWN").upper()
        if state != last_state:
            print(f"==> OCI Run Command SSH authorization: {state}", flush=True)
            last_state = state
        if state in TERMINAL_STATES:
            content = data.get("content") or {}
            exit_code = content.get("exit-code")
            text = str(content.get("text") or "").strip()
            message = str(content.get("message") or "").strip()
            if state != "SUCCEEDED" or exit_code not in (None, 0):
                detail = message or text or "sin detalle"
                raise SystemExit(
                    f"ERROR: autorización SSH por OCI Run Command falló: "
                    f"state={state} exit={exit_code} detail={detail[:500]}"
                )
            return text
        time.sleep(2)
    raise SystemExit("ERROR: timeout esperando la autorización SSH por OCI Run Command.")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", default=os.environ.get("OCI_CLI_PROFILE", "DEFAULT"))
    parser.add_argument("--auth", default=os.environ.get("OCI_CLI_AUTH", "security_token"))
    parser.add_argument("--name", default=os.environ.get("OCI_INSTANCE_NAME", "chess-studio-staging"))
    parser.add_argument("--public-key", default=os.environ.get("OCI_SSH_PUBLIC_KEY", ""))
    parser.add_argument("--private-key", default=os.environ.get("OCI_SSH_KEY", ""))
    args = parser.parse_args()

    path = choose_public_key(args.public_key, args.private_key)
    public_key = read_public_key(path)
    instance = instance_details(args.profile, args.auth, args.name)
    print(f"==> Autorizando clave pública {path} en ubuntu mediante OCI Run Command", flush=True)
    command_id = create_run_command(
        args.profile,
        args.auth,
        instance,
        authorize_command(public_key),
    )
    output = wait_execution(args.profile, args.auth, instance["id"], command_id)
    if "CHESS_STUDIO_SSH_OPERATOR_KEY_OK" not in output:
        raise SystemExit("ERROR: OCI Run Command terminó sin el marcador de autorización SSH.")
    print("==> Clave SSH de operador autorizada; TCP/22 público sigue cerrado.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
