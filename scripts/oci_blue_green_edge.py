#!/usr/bin/env python3
"""Render the stable nginx edge config for OCI blue/green backend deploys."""
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


def render(color: str, *, pvp_mode: str = "direct", committed_sha: str = "") -> str:
    color = str(color or "").strip().lower()
    if color not in VALID_COLORS:
        raise SystemExit(f"invalid backend color: {color!r}")
    if pvp_mode not in {"direct", "go"}:
        raise SystemExit(f"invalid PvP mode: {pvp_mode!r}")
    committed_sha = normalize_committed_sha(committed_sha)
    backend_upstream = f"backend_{color}:4000"
    pvp_upstream = f"pvp_{color}:8080" if pvp_mode == "go" else backend_upstream
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
    committed_location = f"""
    # Host-committed generation. This is intentionally independent from the
    # candidate upstream: it changes only after every post-cutover attestation
    # has passed and rollback restores the previous committed SHA.
    location = /api/_deploy/committed {{
        default_type text/plain;
        add_header Cache-Control "no-store, no-cache, must-revalidate" always;
        add_header Pragma "no-cache" always;
{committed_response}
    }}
"""

    probe_location = ""
    if pvp_mode == "go":
        probe_location = f"""
    # Deploy-only readiness probe: nginx -> Go -> paired Python readiness.
    location = /api/pvp/_edge/ready {{
{proxy_common}
        proxy_set_header Connection "";
        proxy_pass http://{pvp_upstream};
    }}
"""
    return f"""map $http_upgrade $chess_connection_upgrade {{
    default upgrade;
    '' '';
}}

server {{
    listen 8080;
    server_name _;

    access_log off;
    keepalive_timeout 5s;

{committed_location}
{probe_location}
    # PvP is cut over independently so the rest of the product still talks
    # directly to Python while Go progressively takes ownership of the domain.
    location = /api/pvp {{
{proxy_common}
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $chess_connection_upgrade;
        proxy_pass http://{pvp_upstream};
    }}

    location ^~ /api/pvp/ {{
{proxy_common}
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $chess_connection_upgrade;
        proxy_pass http://{pvp_upstream};
    }}

    location / {{
{proxy_common}
        proxy_set_header Connection "";
        keepalive_timeout 5s;
        proxy_pass http://{backend_upstream};
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
    blue = render("blue", pvp_mode="go", committed_sha=sample)
    green = render("green", pvp_mode="go", committed_sha=sample)
    fallback = render("blue", pvp_mode="direct", committed_sha=sample)
    uncommitted = render("blue", pvp_mode="direct")
    assert "backend_blue:4000" in blue
    assert "backend_green:4000" in green
    assert "pvp_blue:8080" in blue
    assert "pvp_green:8080" in green
    assert "pvp_blue:8080" not in fallback
    assert fallback.count("backend_blue:4000") == 3
    assert "location = /api/pvp/_edge/ready" in blue
    assert "location = /api/pvp/_edge/ready" not in fallback
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
    parser.add_argument("--pvp-mode", choices=("direct", "go"), default="direct")
    parser.add_argument("--committed-sha", default="")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if not args.color or not args.output:
        parser.error("--color and --output are required")
    atomic_write(
        pathlib.Path(args.output),
        render(args.color, pvp_mode=args.pvp_mode, committed_sha=args.committed_sha),
    )


if __name__ == "__main__":
    main()
