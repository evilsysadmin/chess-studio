#!/usr/bin/env python3
"""Build metadata and publish a Godot Web export as one immutable R2 release."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import re
import sys
import tempfile
from typing import Any

import r2_asset_publish as transport

core = transport.core
ROOT = pathlib.Path(__file__).resolve().parents[1]
DEFAULT_BUILD_DIR = ROOT / "games/pawn-slug-godot/build/web"
DEFAULT_CONFIG = ROOT / "infra/cloudflare/r2-assets.json"
DEFAULT_PREFIX = "pawn-slug-godot"
POINTER_NAME = "current.json"
REQUIRED_FILES = {"index.html", "index.js", "index.wasm", "index.pck"}
RELEASE_RE = re.compile(r"^[0-9a-f]{16}$")
MIME_OVERRIDES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".pck": "application/octet-stream",
    ".wasm": "application/wasm",
}


class BundleError(RuntimeError):
    pass


def _content_type(path: pathlib.Path) -> str:
    return MIME_OVERRIDES.get(path.suffix.lower(), core.content_type_for(path))


def _files(build_dir: pathlib.Path) -> list[pathlib.Path]:
    if not build_dir.is_dir():
        raise BundleError(f"No existe el export Godot Web: {build_dir}")
    files = sorted(path for path in build_dir.rglob("*") if path.is_file())
    if not files:
        raise BundleError(f"Export Godot Web vacío: {build_dir}")
    relative = {path.relative_to(build_dir).as_posix() for path in files}
    missing = sorted(REQUIRED_FILES - relative)
    if missing:
        raise BundleError(f"Export Godot incompleto; faltan: {', '.join(missing)}")
    if any(path.is_symlink() for path in files):
        raise BundleError("El export Godot no puede contener symlinks")
    return files


def _bundle_digest(build_dir: pathlib.Path, files: list[pathlib.Path]) -> str:
    digest = hashlib.sha256()
    for path in files:
        relative = path.relative_to(build_dir).as_posix()
        data_digest = core.sha256_file(path)
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        digest.update(data_digest.encode("ascii"))
        digest.update(b"\0")
        digest.update(str(path.stat().st_size).encode("ascii"))
        digest.update(b"\n")
    return digest.hexdigest()


def build_pointer(build_dir: pathlib.Path, base_url: str, prefix: str, source_sha: str = "") -> dict[str, Any]:
    files = _files(build_dir)
    digest = _bundle_digest(build_dir, files)
    release = digest[:16]
    release_prefix = f"{prefix.strip('/')}/releases/{release}"
    entries: dict[str, Any] = {}
    for path in files:
        relative = path.relative_to(build_dir).as_posix()
        key = f"{release_prefix}/{relative}"
        entries[relative] = {
            "bytes": path.stat().st_size,
            "contentType": _content_type(path),
            "key": key,
            "sha256": core.sha256_file(path),
            "url": f"{base_url.rstrip('/')}/{key}",
        }
    pointer = {
        "version": 1,
        "release": release,
        "sha256": digest,
        "sourceSha": source_sha if re.fullmatch(r"[0-9a-f]{7,64}", source_sha or "") else "",
        "index": entries["index.html"]["url"],
        "files": entries,
    }
    validate_pointer(pointer, base_url=base_url, prefix=prefix)
    return pointer


def validate_pointer(pointer: Any, *, base_url: str, prefix: str = DEFAULT_PREFIX) -> None:
    if not isinstance(pointer, dict) or pointer.get("version") != 1:
        raise BundleError("Pointer Godot inválido: version")
    release = pointer.get("release")
    digest = pointer.get("sha256")
    files = pointer.get("files")
    if not isinstance(release, str) or not RELEASE_RE.fullmatch(release):
        raise BundleError("Pointer Godot inválido: release")
    if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest):
        raise BundleError("Pointer Godot inválido: sha256")
    if not isinstance(files, dict) or not REQUIRED_FILES.issubset(files):
        raise BundleError("Pointer Godot inválido: files")
    release_prefix = f"{prefix.strip('/')}/releases/{release}"
    expected_index = f"{base_url.rstrip('/')}/{release_prefix}/index.html"
    if pointer.get("index") != expected_index:
        raise BundleError("Pointer Godot inválido: index")
    for relative, entry in files.items():
        if not isinstance(relative, str) or relative.startswith("/") or ".." in pathlib.PurePosixPath(relative).parts:
            raise BundleError(f"Pointer Godot inválido: path {relative!r}")
        if not isinstance(entry, dict):
            raise BundleError(f"Pointer Godot inválido: entry {relative}")
        expected_key = f"{release_prefix}/{relative}"
        if entry.get("key") != expected_key or entry.get("url") != f"{base_url.rstrip('/')}/{expected_key}":
            raise BundleError(f"Pointer Godot inválido: URL/key {relative}")
        if not isinstance(entry.get("bytes"), int) or entry["bytes"] <= 0:
            raise BundleError(f"Pointer Godot inválido: bytes {relative}")
        if not re.fullmatch(r"[0-9a-f]{64}", str(entry.get("sha256", ""))):
            raise BundleError(f"Pointer Godot inválido: sha256 {relative}")


def publish(build_dir: pathlib.Path, config_path: pathlib.Path, prefix: str, dry_run: bool) -> dict[str, Any]:
    config = core.load_config(config_path)
    base_url = f"https://{config['customDomain']}"
    pointer = build_pointer(build_dir, base_url, prefix, os.environ.get("GITHUB_SHA", "").lower())
    if dry_run:
        print(json.dumps(pointer, indent=2, sort_keys=True))
        return pointer

    token, account_id = core.require_env()
    bucket = config["bucket"]
    pointer_key = f"{prefix.strip('/')}/{POINTER_NAME}"
    try:
        existing = json.loads(core.get_object(token, account_id, bucket, pointer_key).decode("utf-8"))
        validate_pointer(existing, base_url=base_url, prefix=prefix)
        if existing.get("sha256") == pointer["sha256"]:
            print(f"UNCHANGED Pawn Slug Godot -> {pointer['index']}")
            return existing
    except Exception:
        pass

    for relative, entry in pointer["files"].items():
        source = build_dir / pathlib.PurePosixPath(relative)
        core.upload_object(token, account_id, bucket, entry["key"], source.read_bytes(), entry["contentType"])
        print(f"UPLOADED {relative} -> {entry['url']}")

    rendered = (json.dumps(pointer, indent=2, sort_keys=True) + "\n").encode("utf-8")
    core.upload_object(token, account_id, bucket, pointer_key, rendered, "application/json; charset=utf-8")
    print(f"PUBLISHED Pawn Slug Godot {pointer['release']} -> {pointer['index']}")
    return pointer


def verify_pointer(path: pathlib.Path, config_path: pathlib.Path, prefix: str, expected_source_sha: str) -> str:
    config = core.load_config(config_path)
    base_url = f"https://{config['customDomain']}"
    try:
        pointer = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise BundleError(f"No se pudo leer pointer Godot: {exc}") from exc
    validate_pointer(pointer, base_url=base_url, prefix=prefix)
    if expected_source_sha and pointer.get("sourceSha") != expected_source_sha.lower():
        raise BundleError(
            f"Pointer Godot apunta a sourceSha={pointer.get('sourceSha')!r}; esperado {expected_source_sha.lower()!r}"
        )
    return str(pointer["index"])


def self_test() -> None:
    with tempfile.TemporaryDirectory() as temp:
        root = pathlib.Path(temp)
        for name, payload in {
            "index.html": b"<html>godot</html>",
            "index.js": b"console.log('godot')",
            "index.wasm": b"wasm" * 32,
            "index.pck": b"pck" * 64,
        }.items():
            (root / name).write_bytes(payload)
        first = build_pointer(root, "https://assets.example.test", DEFAULT_PREFIX, "a" * 40)
        second = build_pointer(root, "https://assets.example.test", DEFAULT_PREFIX, "a" * 40)
        assert first == second
        assert first["index"].endswith(f"/releases/{first['release']}/index.html")
        assert first["files"]["index.wasm"]["contentType"] == "application/wasm"
        (root / "index.pck").write_bytes(b"changed" * 64)
        changed = build_pointer(root, "https://assets.example.test", DEFAULT_PREFIX, "b" * 40)
        assert changed["release"] != first["release"]
        (root / "index.js").unlink()
        try:
            build_pointer(root, "https://assets.example.test", DEFAULT_PREFIX)
        except BundleError:
            pass
        else:
            raise AssertionError("missing required file was accepted")
    print("OK Pawn Slug Godot bundle self-test")


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser()
    sub = result.add_subparsers(dest="command", required=True)
    sub.add_parser("self-test")
    check = sub.add_parser("check")
    check.add_argument("--build-dir", type=pathlib.Path, default=DEFAULT_BUILD_DIR)
    check.add_argument("--config", type=pathlib.Path, default=DEFAULT_CONFIG)
    check.add_argument("--prefix", default=DEFAULT_PREFIX)
    publish_cmd = sub.add_parser("publish")
    publish_cmd.add_argument("--build-dir", type=pathlib.Path, default=DEFAULT_BUILD_DIR)
    publish_cmd.add_argument("--config", type=pathlib.Path, default=DEFAULT_CONFIG)
    publish_cmd.add_argument("--prefix", default=DEFAULT_PREFIX)
    publish_cmd.add_argument("--dry-run", action="store_true")
    verify = sub.add_parser("verify-pointer")
    verify.add_argument("path", type=pathlib.Path)
    verify.add_argument("--config", type=pathlib.Path, default=DEFAULT_CONFIG)
    verify.add_argument("--prefix", default=DEFAULT_PREFIX)
    verify.add_argument("--expected-source-sha", default="")
    return result


def main() -> int:
    args = parser().parse_args()
    try:
        if args.command == "self-test":
            self_test()
        elif args.command == "check":
            config = core.load_config(args.config)
            pointer = build_pointer(args.build_dir, f"https://{config['customDomain']}", args.prefix)
            print(json.dumps(pointer, indent=2, sort_keys=True))
        elif args.command == "publish":
            publish(args.build_dir, args.config, args.prefix, args.dry_run)
        elif args.command == "verify-pointer":
            print(verify_pointer(args.path, args.config, args.prefix, args.expected_source_sha))
        return 0
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
