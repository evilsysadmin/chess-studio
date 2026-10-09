#!/usr/bin/env python3
"""Carry prior immutable Vite JS/CSS into the next Cloudflare Pages deployment.

Never copy HTML, data, API responses, mutable filenames or unchecked bytes.
Two previous generations are retained; on an older deployment without the
manifest this bootstraps tracking (the first rollout cannot restore unlisted
historic chunks).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import re
import tempfile
import urllib.error
import urllib.request
from typing import Callable

MANIFEST = "asset-grace.json"
MAX_PREVIOUS_GENERATIONS = 2
MAX_FILES = 1200
MAX_HISTORY_BYTES = 64 * 1024 * 1024
MAX_FILE_BYTES = 16 * 1024 * 1024
CHUNK = re.compile(r"^assets/[A-Za-z0-9_./-]+-[A-Za-z0-9_-]{8,}\.(?:js|mjs|css)$")
BUILD = re.compile(r"^[a-f0-9]{40}$")


def check_path(name: object) -> str:
    if not isinstance(name, str) or not CHUNK.fullmatch(name):
        raise ValueError(f"not an immutable runtime chunk: {str(name)[:100]}")
    if any(part in {".", ".."} for part in pathlib.PurePosixPath(name).parts):
        raise ValueError("path traversal in runtime asset")
    return name


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def inventory(dist: pathlib.Path) -> list[dict]:
    entries: list[dict] = []
    for item in sorted((dist / "assets").rglob("*")):
        if not item.is_file():
            continue
        name = item.relative_to(dist).as_posix()
        if not CHUNK.fullmatch(name):
            continue
        check_path(name)
        length = item.stat().st_size
        if length > MAX_FILE_BYTES:
            raise ValueError(f"chunk exceeds limit: {name}")
        entries.append({"path": name, "size": length, "sha256": digest(item.read_bytes())})
    if not entries or len(entries) > MAX_FILES:
        raise ValueError(f"invalid build chunk inventory: {len(entries)} files")
    return entries


def validate_manifest(payload: object) -> list[dict]:
    if not isinstance(payload, dict) or payload.get("schema") != 1:
        raise ValueError("invalid asset-grace manifest schema")
    generations = payload.get("generations")
    if not isinstance(generations, list) or not 1 <= len(generations) <= 3:
        raise ValueError("invalid asset-grace generations")
    result = []
    for generation in generations:
        if not isinstance(generation, dict) or not BUILD.fullmatch(str(generation.get("build", ""))):
            raise ValueError("invalid asset-grace build identity")
        assets = generation.get("assets")
        if not isinstance(assets, list) or not 1 <= len(assets) <= MAX_FILES:
            raise ValueError("invalid asset-grace inventory")
        seen = set()
        validated = []
        for asset in assets:
            if not isinstance(asset, dict):
                raise ValueError("invalid asset-grace chunk entry")
            name = check_path(asset.get("path"))
            size = asset.get("size")
            checksum = asset.get("sha256")
            if name in seen or type(size) is not int or not 0 <= size <= MAX_FILE_BYTES:
                raise ValueError("duplicate chunk or invalid size")
            if not isinstance(checksum, str) or not re.fullmatch(r"[a-f0-9]{64}", checksum):
                raise ValueError("invalid asset-grace digest")
            seen.add(name)
            validated.append({"path": name, "size": size, "sha256": checksum})
        result.append({"build": generation["build"], "assets": validated})
    return result


def fetch_from_origin(origin: str, path: str, limit: int, *, optional: bool = False) -> bytes | None:
    if not re.fullmatch(r"https://[A-Za-z0-9.-]+", origin):
        raise ValueError("asset grace origin must be an HTTPS hostname")
    url = origin + "/" + path
    request = urllib.request.Request(url, headers={
        "Cache-Control": "no-cache, no-store",
        "Accept": "application/json" if path.startswith(("release.json", MANIFEST)) else "*/*",
    })
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            if response.status != 200:
                raise ValueError(f"unexpected HTTP status for {path}: {response.status}")
            data = response.read(limit + 1)
            mime = response.headers.get("Content-Type", "").split(";", 1)[0].lower()
    except urllib.error.HTTPError as error:
        if error.code == 404 and optional:
            return None
        raise
    if len(data) > limit:
        raise ValueError(f"oversized remote response for {path}")
    # On the first deployment of this feature, Pages may serve the actual SPA
    # index.html with HTTP 200 for the not-yet-existing manifest. Recognize
    # only our known React shell as an absent optional manifest. A CF challenge,
    # corrupt JSON or HTML served for a real hashed asset still fails closed.
    if path == MANIFEST and optional and mime == "text/html":
        html = data.lstrip().lower()
        if html.startswith(b"<!doctype html") and (b'<div id="root"' in html or b"<div id='root'" in html):
            return None
    return data


def release_build(data: bytes) -> str:
    payload = json.loads(data)
    build = payload.get("build") if isinstance(payload, dict) else None
    if not isinstance(build, str) or not BUILD.fullmatch(build):
        raise ValueError("remote release has no valid build SHA")
    return build


def prepare(dist: pathlib.Path, fetch: Callable, *, max_previous: int = MAX_PREVIOUS_GENERATIONS) -> dict:
    dist = dist.resolve()
    new_release = json.loads((dist / "release.json").read_text(encoding="utf-8"))
    current_build = str(new_release.get("build", ""))
    if not BUILD.fullmatch(current_build):
        raise ValueError("new release must carry the exact 40-char build SHA")
    current = {"build": current_build, "assets": inventory(dist)}
    remote_release = fetch("release.json", 8192, optional=True)
    remote_manifest = fetch(MANIFEST, 2 * 1024 * 1024, optional=True)

    old_generations = []
    original_build = None
    if remote_manifest is not None:
        if remote_release is None:
            raise ValueError("manifest exists but published release identity is absent")
        old_generations = validate_manifest(json.loads(remote_manifest))
        original_build = release_build(remote_release)
        if old_generations[0]["build"] != original_build:
            raise ValueError("published asset manifest and release SHA disagree")
    if old_generations and old_generations[0]["build"] == current_build:
        # Re-deploy of same SHA is idempotent.
        old_generations = old_generations[1:]

    retained = []
    bytes_kept = 0
    files_seen = {item["path"]: item for item in current["assets"]}
    for generation in old_generations[:max_previous]:
        additional = [item for item in generation["assets"] if item["path"] not in files_seen]
        new_bytes = sum(item["size"] for item in additional)
        if bytes_kept + new_bytes > MAX_HISTORY_BYTES or len(files_seen) + len(additional) > MAX_FILES:
            raise ValueError("previous generation exceeds bounded asset retention budget")
        for entry in additional:
            data = fetch(entry["path"], MAX_FILE_BYTES, optional=False)
            if data is None or len(data) != entry["size"] or digest(data) != entry["sha256"]:
                raise ValueError(f"previous chunk integrity failed: {entry['path']}")
            target = dist / entry["path"]
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            files_seen[entry["path"]] = entry
        retained.append(generation)
        bytes_kept += new_bytes

    if old_generations:
        after = fetch("release.json", 8192, optional=False)
        if after is None or release_build(after) != original_build:
            raise ValueError("published frontend changed while copying old assets")

    result = {"schema": 1, "generations": [current, *retained]}
    # Never publish an invalid inventory or silently omit an old generation.
    validate_manifest(result)
    (dist / MANIFEST).write_text(json.dumps(result, separators=(",", ":"), sort_keys=True) + "\n", encoding="utf-8")
    return {"build": current_build, "retained": len(retained), "files": len(files_seen), "bytes": bytes_kept}


def self_test() -> None:
    assert check_path("assets/Board3D-aBcDeF01.js").endswith(".js")
    # A missing Pages file can return index.html with HTTP 200. The initial
    # upload must bootstrap, not abort or cache the document as an asset.
    original_urlopen = urllib.request.urlopen
    class FakeResponse:
        status = 200
        headers = {"Content-Type": "text/html; charset=UTF-8"}
        def __init__(self, content):
            self.content = content
        def __enter__(self):
            return self
        def __exit__(self, *_):
            return False
        def read(self, _limit):
            return self.content
    try:
        urllib.request.urlopen = lambda _request, timeout=15: FakeResponse(
            b'<!doctype html><html><body><div id="root"></div></body></html>'
        )
        assert fetch_from_origin("https://example.com", MANIFEST, 2048, optional=True) is None
        assert fetch_from_origin("https://example.com", MANIFEST, 2048, optional=False) is not None
        assert fetch_from_origin("https://example.com", "assets/Old-12345678.js", 2048, optional=True) is not None
        urllib.request.urlopen = lambda _request, timeout=15: FakeResponse(b"<html>Cloudflare challenge</html>")
        assert fetch_from_origin("https://example.com", MANIFEST, 2048, optional=True) is not None
    finally:
        urllib.request.urlopen = original_urlopen
    for item in ("../env.js", "assets/../secrets-aabbccdd.js", "/assets/a-abc12345.js", "assets/raw.js"):
        try:
            check_path(item)
        except ValueError:
            continue
        raise AssertionError(f"accepted unsafe asset name: {item}")
    with tempfile.TemporaryDirectory() as root:
        root_path = pathlib.Path(root)
        remote = {}
        def make_dist(sha: str, suffix: str) -> pathlib.Path:
            dist = root_path / suffix
            (dist / "assets").mkdir(parents=True)
            (dist / "assets" / f"Game-{suffix * 8}.js").write_bytes(b"export default " + suffix.encode())
            (dist / "release.json").write_text(json.dumps({"build": sha}), encoding="utf-8")
            return dist

        def fake_fetch(path: str, limit: int, *, optional: bool = False):
            value = remote.get(path)
            if value is None and not optional:
                raise ValueError(f"missing remote {path}")
            return value

        def publish(dist: pathlib.Path):
            remote.clear()
            for item in dist.rglob("*"):
                if item.is_file():
                    remote[item.relative_to(dist).as_posix()] = item.read_bytes()

        first = make_dist("a" * 40, "a")
        assert prepare(first, fake_fetch)["retained"] == 0
        publish(first)
        second = make_dist("b" * 40, "b")
        assert prepare(second, fake_fetch)["retained"] == 1
        assert (second / "assets/Game-aaaaaaaa.js").read_bytes() == b"export default a"
        publish(second)
        third = make_dist("c" * 40, "c")
        assert prepare(third, fake_fetch)["retained"] == 2
        assert all((third / f"assets/Game-{x*8}.js").exists() for x in "abc")
        publish(third)
        fourth = make_dist("d" * 40, "d")
        assert prepare(fourth, fake_fetch)["retained"] == 2
        assert not (fourth / "assets/Game-aaaaaaaa.js").exists()
        remote["assets/Game-cccccccc.js"] = b"corrupted"
        fifth = make_dist("e" * 40, "e")
        try:
            prepare(fifth, fake_fetch)
        except ValueError:
            pass
        else:
            raise AssertionError("corrupt historical chunk was accepted")
    print("pages asset-grace self-test: OK")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dist", type=pathlib.Path)
    parser.add_argument("--origin")
    parser.add_argument("--site", choices=("staging", "production"))
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    sites = {
        "staging": "https://staging.chess-studio.shadowops.dpdns.org",
        "production": "https://chess-studio-production.pages.dev",
    }
    if not args.dist or not (args.origin or args.site) or (args.origin and args.site):
        parser.error("--dist and exactly one of --origin/--site are required")
    origin = (args.origin or sites[args.site]).rstrip("/")
    result = prepare(args.dist, lambda path, size, optional=False:
                     fetch_from_origin(origin, path, size, optional=optional))
    print("PAGES_ASSET_GRACE_OK " + json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
