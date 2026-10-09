#!/usr/bin/env python3
"""Render the stable nginx edge config for the OCI blue/green Go API slots."""
from __future__ import annotations

import argparse
import os
import pathlib
import tempfile

VALID_COLORS = {"blue", "green"}


def normalize_committed_sha(value: str) -> str:
    normalized = str(value or "").strip().lower()
    if not normalized:
        return ""
    if len(normalized) != 40 or any(ch not in "0123456789abcdef" for ch in normalized):
        raise SystemExit(f"invalid committed backend SHA: {value!r}")
    return normalized


def render(color: str, *, committed_sha: str = "") -> str:
    """nginx in front of the Go API slot of ``color``: it serves every route
    (Python was retired on 2026-10-10, so there is no other upstream)."""
    color = str(color or "").strip().lower()
    if color not in VALID_COLORS:
        raise SystemExit(f"invalid backend color: {color!r}")
    committed_sha = normalize_committed_sha(committed_sha)
    upstream = f"pvp_{color}:8080"
    proxy_common = """        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
        proxy_connect_timeout 2s;
        proxy_send_timeout 45s;
        proxy_read_timeout 45s;"""
    committed_response = (
        f'        return 200 "{committed_sha}\\n";'
        if committed_sha
        else '        return 503 "uncommitted\\n";'
    )
    return f"""map $http_upgrade $chess_connection_upgrade {{
    default upgrade;
    '' '';
}}

server {{
    listen 8080;
    server_name _;

    access_log off;
    keepalive_timeout 5s;

    # Host-committed generation. This is intentionally independent from the
    # candidate upstream: it changes only after every post-cutover attestation
    # has passed and rollback restores the previous committed SHA.
    location = /api/_deploy/committed {{
        default_type text/plain;
        add_header Cache-Control "no-store, no-cache, must-revalidate" always;
        add_header Pragma "no-cache" always;
{committed_response}
    }}

    # Deploy-only readiness probe of the Go slot behind this edge.
    location = /api/pvp/_edge/ready {{
{proxy_common}
        proxy_set_header Connection "";
        proxy_pass http://{upstream};
    }}

    # PvP keeps websocket upgrades.
    location = /api/pvp {{
{proxy_common}
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $chess_connection_upgrade;
        proxy_pass http://{upstream};
    }}

    location ^~ /api/pvp/ {{
{proxy_common}
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $chess_connection_upgrade;
        proxy_pass http://{upstream};
    }}

    location / {{
{proxy_common}
        proxy_set_header Connection "";
        keepalive_timeout 5s;
        proxy_pass http://{upstream};
    }}
}}
"""


def atomic_write(path: pathlib.Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=".edge.", suffix=".conf", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(tmp_name, 0o644)
        os.replace(tmp_name, path)
    finally:
        try:
            os.unlink(tmp_name)
        except FileNotFoundError:
            pass


def self_test() -> None:
    sample = "0123456789abcdef0123456789abcdef01234567"
    blue = render("blue", committed_sha=sample)
    green = render("green", committed_sha=sample)
    uncommitted = render("blue")
    assert blue.count("pvp_blue:8080") == 4  # probe, /api/pvp, /api/pvp/, /
    assert green.count("pvp_green:8080") == 4
    assert "pvp_green" not in blue and "pvp_blue" not in green
    assert "backend_" not in blue + green  # no Python upstream exists any more
    assert "location = /api/pvp/_edge/ready" in blue
    assert "location = /api/pvp" in blue
    assert "location ^~ /api/pvp/" in blue
    assert "proxy_set_header Upgrade $http_upgrade;" in blue
    assert "proxy_set_header Connection $chess_connection_upgrade;" in blue
    assert "proxy_read_timeout 45s" in blue
    assert "keepalive_timeout 5s" in blue
    assert "listen 8080" in blue
    assert "location = /api/_deploy/committed" in blue
    assert f'return 200 "{sample}\\n";' in blue
    assert 'return 503 "uncommitted\\n";' in uncommitted
    assert normalize_committed_sha(sample.upper()) == sample
    for invalid_sha in ("main", "g" * 40, sample[:-1]):
        try:
            render("blue", committed_sha=invalid_sha)
        except SystemExit:
            pass
        else:
            raise AssertionError(f"accepted invalid committed SHA: {invalid_sha!r}")
    for invalid in ("", "red", "../blue", "BLUE GREEN"):
        try:
            render(invalid)
        except SystemExit:
            pass
        else:
            raise AssertionError(f"accepted invalid color: {invalid!r}")
    print("OCI blue/green edge self-test: OK")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--color", choices=sorted(VALID_COLORS))
    parser.add_argument("--output")
    parser.add_argument("--committed-sha", default="")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if not args.color or not args.output:
        parser.error("--color and --output are required")
    atomic_write(
        pathlib.Path(args.output),
        render(args.color, committed_sha=args.committed_sha),
    )


if __name__ == "__main__":
    main()
