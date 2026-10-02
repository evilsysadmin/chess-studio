#!/usr/bin/env python3
"""Narrow root helper that authorizes one operator SSH public key for ubuntu."""

from __future__ import annotations

import base64
import os
from pathlib import Path
import pwd
import re
import sys

KEY_RE = re.compile(
    r"^(ssh-ed25519|ssh-rsa|ecdsa-sha2-[A-Za-z0-9@._+-]+|"
    r"sk-ssh-ed25519@openssh\.com|sk-ecdsa-sha2-nistp256@openssh\.com) "
    r"([A-Za-z0-9+/]+={0,3})(?: .*)?$"
)
TMP_PREFIX = "chess-studio-operator-key."


def validate_public_key(raw: str) -> tuple[str, str]:
    if "\x00" in raw or "\r" in raw:
        raise SystemExit("invalid SSH public key encoding")
    lines = [line.strip() for line in raw.splitlines() if line.strip()]
    if len(lines) != 1:
        raise SystemExit("operator SSH key file must contain exactly one non-empty public key")
    line = lines[0]
    if "PRIVATE KEY" in line.upper():
        raise SystemExit("refusing private key material")
    match = KEY_RE.fullmatch(line)
    if not match:
        raise SystemExit("operator SSH key is not a supported OpenSSH public key")
    try:
        base64.b64decode(match.group(2), validate=True)
    except Exception as exc:
        raise SystemExit("operator SSH key payload is not valid base64") from exc
    return line, f"{match.group(1)} {match.group(2)}"


def main() -> int:
    if os.geteuid() != 0:
        raise SystemExit("chess-studio-ssh-authorize must run as root")
    if len(sys.argv) != 2:
        raise SystemExit("usage: chess-studio-ssh-authorize /tmp/chess-studio-operator-key.*")

    source = Path(sys.argv[1])
    if source.parent != Path("/tmp") or not source.name.startswith(TMP_PREFIX):
        raise SystemExit("refusing SSH key path outside the fixed /tmp operator-key namespace")
    stat = source.lstat()
    if not source.is_file() or source.is_symlink():
        raise SystemExit("operator SSH key source must be a regular non-symlink file")
    if stat.st_mode & 0o077:
        raise SystemExit("operator SSH key source must not be group/world accessible")
    if stat.st_size <= 0 or stat.st_size > 8192:
        raise SystemExit("operator SSH key source has an invalid size")

    line, identity = validate_public_key(source.read_text(encoding="utf-8"))

    user = pwd.getpwnam("ubuntu")
    ssh_dir = Path(user.pw_dir) / ".ssh"
    authorized = ssh_dir / "authorized_keys"
    ssh_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chown(ssh_dir, user.pw_uid, user.pw_gid)
    os.chmod(ssh_dir, 0o700)

    existing = authorized.read_text(encoding="utf-8") if authorized.exists() else ""
    identities = set()
    for existing_line in existing.splitlines():
        parts = existing_line.strip().split()
        if len(parts) >= 2:
            identities.add(f"{parts[0]} {parts[1]}")

    if identity not in identities:
        body = existing
        if body and not body.endswith("\n"):
            body += "\n"
        body += line + "\n"
        tmp = ssh_dir / ".authorized_keys.chess-studio.tmp"
        tmp.write_text(body, encoding="utf-8")
        os.chown(tmp, user.pw_uid, user.pw_gid)
        os.chmod(tmp, 0o600)
        os.replace(tmp, authorized)

    if authorized.exists():
        os.chown(authorized, user.pw_uid, user.pw_gid)
        os.chmod(authorized, 0o600)
    print("CHESS_STUDIO_SSH_OPERATOR_KEY_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
