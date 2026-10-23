#!/usr/bin/env python3
"""Fail-closed checks for one reviewed Chronicles merchant-art release.

Only the approved SHA-256 can be published. Never put the WebP into git.
This is deliberately independent of the game frontend; it verifies content
before upload and verifies public CDN bytes after upload.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import sys
import time
import urllib.error
import urllib.request

SHA256 = "79e0b13fc2ee2ffbc8f8aa7a1f569cb4c5776935fcb428bafc09a6820aea43e1"
SIZE = 200250
LOGICAL_ID = "chronicles.shop.odo"
KEY = f"chronicles/shops/odo/odo-premium-composite-{SHA256[:16]}.webp"
ORIGIN = "https://assets.chess-studio.shadowops.dpdns.org"
URL = f"{ORIGIN}/{KEY}"
TAG = f"chronicles-odo-r2-{SHA256[:16]}"


def verify_bytes(content: bytes) -> None:
    if len(content) != SIZE:
        raise ValueError(f"Expected {SIZE} bytes, received {len(content)}")
    digest = hashlib.sha256(content).hexdigest()
    if digest != SHA256:
        raise ValueError(f"Wrong SHA256: {digest}")


def verify_source(path: pathlib.Path) -> None:
    content = path.read_bytes()
    verify_bytes(content)
    if not (content[:4] == b"RIFF" and content[8:12] == b"WEBP"):
        raise ValueError("Approved art is not WebP")


def expected_entry() -> dict:
    return {"bytes": SIZE, "contentType": "image/webp",
            "key": KEY, "sha256": SHA256, "url": URL}


def verify_manifest(before: pathlib.Path, after: pathlib.Path) -> None:
    a = json.loads(before.read_text(encoding="utf-8"))
    b = json.loads(after.read_text(encoding="utf-8"))
    for doc in (a, b):
        if doc.get("version") != 1 or doc.get("baseUrl") != ORIGIN:
            raise ValueError("Unrecognized R2 manifest owner/version")
        if not isinstance(doc.get("assets"), dict):
            raise ValueError("Invalid manifest assets")
    old = a["assets"].copy()
    new = b["assets"].copy()
    existing = old.pop(LOGICAL_ID, None)
    pinned = new.pop(LOGICAL_ID, None)
    if pinned != expected_entry():
        raise ValueError("Manifest does not pin exact approved Odo bytes")
    if existing not in (None, expected_entry()):
        raise ValueError("Would replace a different Odo image")
    if old != new:
        raise ValueError("Publishing changed another game/music/R2 asset")
    if {k: v for k, v in a.items() if k != "assets"} != {
            k: v for k, v in b.items() if k != "assets"}:
        raise ValueError("Unexpected top-level manifest changes")


def verify_public(retries: int = 12, delay: int = 5) -> None:
    for attempt in range(retries):
        try:
            request = urllib.request.Request(
                URL, headers={"User-Agent": "chronicles-odo-r2-validation/1",
                              "Accept": "image/webp"})
            with urllib.request.urlopen(request, timeout=30) as response:
                if response.geturl() != URL:
                    raise ValueError("CDN redirected from reviewed immutable URL")
                content_type = response.headers.get("Content-Type", "").split(";")[0].strip().lower()
                if content_type != "image/webp":
                    raise ValueError(f"Wrong Content-Type: {content_type}")
                verify_bytes(response.read(SIZE + 1))
            print(f"Verified public immutable Odo: {URL}")
            return
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError) as exc:
            if attempt == retries - 1:
                raise ValueError(f"CDN still unverified: {exc}") from exc
            print(f"CDN readback retry {attempt + 1}/{retries}: {type(exc).__name__}",
                  file=sys.stderr)
            time.sleep(delay)


def self_test() -> None:
    payload = b"RIFF" + b"\x00" * 4 + b"WEBP"
    try:
        verify_bytes(payload)
        raise AssertionError("Invalid bytes accepted")
    except ValueError:
        pass
    assert KEY.endswith(f"-{SHA256[:16]}.webp")
    assert expected_entry()["url"] == URL
    import tempfile
    with tempfile.TemporaryDirectory() as temp:
        root = pathlib.Path(temp)
        a, b = root / "a.json", root / "b.json"
        original = {"version": 1, "baseUrl": ORIGIN,
                    "assets": {"chronicles.music.firstVerse": {"key": "legacy.mp3"}}}
        after = json.loads(json.dumps(original))
        after["assets"][LOGICAL_ID] = expected_entry()
        a.write_text(json.dumps(original))
        b.write_text(json.dumps(after))
        verify_manifest(a, b)
        after["assets"]["chronicles.music.firstVerse"]["key"] = "changed.mp3"
        b.write_text(json.dumps(after))
        try:
            verify_manifest(a, b)
            raise AssertionError("Existing music pin mutation accepted")
        except ValueError:
            pass
    print("Chronicles Odo pipeline contract OK")


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("self-test")
    check = sub.add_parser("source")
    check.add_argument("path", type=pathlib.Path)
    manifest = sub.add_parser("manifest")
    manifest.add_argument("before", type=pathlib.Path)
    manifest.add_argument("after", type=pathlib.Path)
    sub.add_parser("public")
    args = parser.parse_args()
    if args.cmd == "self-test":
        self_test()
    elif args.cmd == "source":
        verify_source(args.path)
        print(f"Approved Odo source OK: sha256={SHA256} bytes={SIZE}")
    elif args.cmd == "manifest":
        verify_manifest(args.before, args.after)
        print("Existing R2 manifest pins preserved")
    elif args.cmd == "public":
        verify_public()


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        print(f"::error::{exc}", file=sys.stderr)
        sys.exit(1)
