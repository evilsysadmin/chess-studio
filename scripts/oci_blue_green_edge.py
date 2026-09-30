#!/usr/bin/env python3
"""Render the stable nginx edge config for OCI blue/green backend deploys."""
from __future__ import annotations

import argparse
import os
import pathlib
import tempfile

VALID_COLORS = {"blue", "green"}


def render(color: str) -> str:
    color = str(color or "").strip().lower()
    if color not in VALID_COLORS:
        raise SystemExit(f"invalid backend color: {color!r}")
    upstream = f"backend_{color}:4000"
    return f"""server {{
    listen 8080;
    server_name _;

    access_log off;

    location / {{
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
        proxy_set_header Connection "";
        proxy_connect_timeout 2s;
        proxy_send_timeout 45s;
        proxy_read_timeout 45s;
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
    blue = render("blue")
    green = render("green")
    assert "backend_blue:4000" in blue
    assert "backend_green:4000" in green
    assert "proxy_read_timeout 45s" in blue
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
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if not args.color or not args.output:
        parser.error("--color and --output are required")
    atomic_write(pathlib.Path(args.output), render(args.color))


if __name__ == "__main__":
    main()
