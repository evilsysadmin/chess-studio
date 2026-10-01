#!/usr/bin/env python3
"""Render the stable nginx edge config for OCI blue/green backend deploys."""
from __future__ import annotations

import argparse
import os
import pathlib
import tempfile

VALID_COLORS = {"blue", "green"}


def render(color: str, *, pvp_mode: str = "direct") -> str:
    color = str(color or "").strip().lower()
    if color not in VALID_COLORS:
        raise SystemExit(f"invalid backend color: {color!r}")
    if pvp_mode not in {"direct", "go"}:
        raise SystemExit(f"invalid PvP mode: {pvp_mode!r}")
    backend_upstream = f"backend_{color}:4000"
    pvp_upstream = f"pvp_{color}:8080" if pvp_mode == "go" else backend_upstream
    proxy_common = """        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
        proxy_connect_timeout 2s;
        proxy_send_timeout 45s;
        proxy_read_timeout 45s;"""
    return f"""map $http_upgrade $chess_connection_upgrade {{
    default upgrade;
    '' '';
}}

server {{
    listen 8080;
    server_name _;

    access_log off;
    keepalive_timeout 5s;

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
    blue = render("blue", pvp_mode="go")
    green = render("green", pvp_mode="go")
    fallback = render("blue", pvp_mode="direct")
    assert "backend_blue:4000" in blue
    assert "backend_green:4000" in green
    assert "pvp_blue:8080" in blue
    assert "pvp_green:8080" in green
    assert "pvp_blue:8080" not in fallback
    assert fallback.count("backend_blue:4000") == 3
    assert "location = /api/pvp" in blue
    assert "location ^~ /api/pvp/" in blue
    assert "proxy_set_header Upgrade $http_upgrade;" in blue
    assert "proxy_set_header Connection $chess_connection_upgrade;" in blue
    assert "proxy_read_timeout 45s" in blue
    assert "keepalive_timeout 5s" in blue
    assert "listen 8080" in blue
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
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if not args.color or not args.output:
        parser.error("--color and --output are required")
    atomic_write(pathlib.Path(args.output), render(args.color, pvp_mode=args.pvp_mode))


if __name__ == "__main__":
    main()
