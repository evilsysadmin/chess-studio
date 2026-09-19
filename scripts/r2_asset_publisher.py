#!/usr/bin/env python3
"""Publish immutable Chess Studio assets to Cloudflare R2.

Normal assets use the Cloudflare REST API and the existing
CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID pair. No S3 credentials are needed
for objects up to Cloudflare's 300 MB REST upload limit.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import os
import pathlib
import re
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import uuid
from typing import Any

from cloudflare_r2_assets import API_BASE, DEFAULT_CONFIG, api_request, load_config, require_env

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = ROOT / "frontend/src/assets/r2-assets-manifest.json"
REST_UPLOAD_LIMIT = 300 * 1024 * 1024
SAFE_SEGMENT_RE = re.compile(r"[^A-Za-z0-9._-]+")
KNOWN_MIME = {
    ".avif": "image/avif",
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
    ".webm": "video/webm",
    ".webp": "image/webp",
}


class PublishError(RuntimeError):
    pass


def sha256_file(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def content_type_for(path: pathlib.Path) -> str:
    suffix = path.suffix.lower()
    if suffix in KNOWN_MIME:
        return KNOWN_MIME[suffix]
    guessed, _ = mimetypes.guess_type(path.name)
    return guessed or "application/octet-stream"


def safe_segment(value: str) -> str:
    cleaned = SAFE_SEGMENT_RE.sub("-", value.strip()).strip("-._")
    if not cleaned:
        raise PublishError(f"Segmento de asset inválido: {value!r}")
    return cleaned


def normalize_prefix(value: str) -> str:
    parts = [safe_segment(part) for part in value.strip("/").split("/") if part]
    if not parts:
        raise PublishError("prefix no puede estar vacío")
    return "/".join(parts)


def object_key_for(source: pathlib.Path, prefix: str, digest: str) -> str:
    stem = safe_segment(source.stem)
    return f"{normalize_prefix(prefix)}/{stem}-{digest[:16]}{source.suffix.lower()}"


def object_path(account_id: str, bucket: str, key: str) -> str:
    quoted_key = urllib.parse.quote(key, safe="/-._~")
    quoted_bucket = urllib.parse.quote(bucket, safe="")
    return f"/accounts/{account_id}/r2/buckets/{quoted_bucket}/objects/{quoted_key}"


def decode_json(raw: bytes) -> Any:
    try:
        return json.loads(raw.decode("utf-8") or "{}")
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise PublishError(f"Respuesta JSON inválida de Cloudflare: {exc}") from exc


def upload_object(token: str, account_id: str, bucket: str, key: str, data: bytes, content_type: str) -> dict[str, Any]:
    if len(data) > REST_UPLOAD_LIMIT:
        raise PublishError("Asset >300 MB: requiere S3/multipart")

    # The R2 REST "put object" endpoint takes the raw body; multipart/form-data now returns HTTP 501.
    request = urllib.request.Request(
        API_BASE + object_path(account_id, bucket, key),
        data=data,
        method="PUT",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "Content-Type": content_type,
            "cf-r2-storage-class": "Standard",
            "User-Agent": "chess-studio-r2-publisher/1",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = decode_json(response.read())
    except urllib.error.HTTPError as exc:
        raise PublishError(f"Cloudflare upload HTTP {exc.code}: {decode_json(exc.read())}") from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise PublishError(f"Cloudflare upload no accesible: {exc}") from exc

    if not isinstance(payload, dict) or payload.get("success") is False:
        raise PublishError(f"Cloudflare rechazó el upload: {payload!r}")
    result = payload.get("result")
    return result if isinstance(result, dict) else {}


def get_object(token: str, account_id: str, bucket: str, key: str) -> bytes:
    request = urllib.request.Request(
        API_BASE + object_path(account_id, bucket, key),
        method="GET",
        headers={"Authorization": f"Bearer {token}", "User-Agent": "chess-studio-r2-publisher/1"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.read()
    except urllib.error.HTTPError as exc:
        raise PublishError(f"Cloudflare GET HTTP {exc.code} para {key}") from exc


def delete_object(token: str, account_id: str, bucket: str, key: str) -> None:
    api_request(token, "DELETE", object_path(account_id, bucket, key))


def blank_manifest(base_url: str) -> dict[str, Any]:
    return {"version": 1, "baseUrl": base_url.rstrip("/"), "assets": {}}


def validate_manifest(value: Any) -> None:
    if not isinstance(value, dict) or value.get("version") != 1:
        raise PublishError("El manifest R2 debe ser un objeto version=1")
    base_url = value.get("baseUrl")
    assets = value.get("assets")
    if not isinstance(base_url, str) or not base_url.startswith("https://"):
        raise PublishError("manifest.baseUrl debe ser HTTPS")
    if not isinstance(assets, dict):
        raise PublishError("manifest.assets debe ser un objeto")
    for logical_id, entry in assets.items():
        if not isinstance(logical_id, str) or not logical_id or not isinstance(entry, dict):
            raise PublishError("Entrada inválida en manifest")
        required = {"key", "url", "sha256", "bytes", "contentType"}
        missing = sorted(required - set(entry))
        if missing:
            raise PublishError(f"{logical_id}: faltan {', '.join(missing)}")
        digest = entry["sha256"]
        if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest):
            raise PublishError(f"{logical_id}: sha256 inválido")
        if not isinstance(entry["bytes"], int) or entry["bytes"] < 0:
            raise PublishError(f"{logical_id}: bytes inválido")
        key = entry["key"]
        if not isinstance(key, str) or not key or key.startswith("/") or ".." in key.split("/"):
            raise PublishError(f"{logical_id}: key inválida")
        if entry["url"] != f"{base_url.rstrip('/')}/{key}":
            raise PublishError(f"{logical_id}: url no coincide con baseUrl/key")


def load_manifest(path: pathlib.Path, base_url: str) -> dict[str, Any]:
    if not path.exists():
        return blank_manifest(base_url)
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise PublishError(f"No se pudo leer {path}: {exc}") from exc
    validate_manifest(manifest)
    if manifest["baseUrl"].rstrip("/") != base_url.rstrip("/"):
        raise PublishError("baseUrl del manifest no coincide con la configuración R2")
    return manifest


def write_manifest(path: pathlib.Path, manifest: dict[str, Any]) -> None:
    validate_manifest(manifest)
    path.parent.mkdir(parents=True, exist_ok=True)
    rendered = json.dumps(manifest, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        handle.write(rendered)
        temp_path = pathlib.Path(handle.name)
    temp_path.replace(path)


def publish(source: pathlib.Path, logical_id: str, prefix: str, manifest_path: pathlib.Path, config_path: pathlib.Path, dry_run: bool) -> dict[str, Any]:
    if not source.is_file():
        raise PublishError(f"No existe el asset: {source}")
    size = source.stat().st_size
    if size <= 0:
        raise PublishError(f"Asset vacío: {source}")
    if size > REST_UPLOAD_LIMIT:
        raise PublishError(f"{source} pesa {size} bytes (>300 MB): requiere S3/multipart")

    config = load_config(config_path)
    base_url = f"https://{config['customDomain']}"
    manifest = load_manifest(manifest_path, base_url)
    digest = sha256_file(source)
    key = object_key_for(source, prefix, digest)
    entry = {
        "bytes": size,
        "contentType": content_type_for(source),
        "key": key,
        "sha256": digest,
        "url": f"{base_url}/{key}",
    }

    if manifest["assets"].get(logical_id) == entry:
        print(f"UNCHANGED {logical_id} -> {entry['url']}")
        return entry
    if dry_run:
        print(json.dumps({"logicalId": logical_id, **entry}, indent=2))
        return entry

    token, account_id = require_env()
    result = upload_object(token, account_id, config["bucket"], key, source.read_bytes(), entry["contentType"])
    if result.get("key") not in (None, key):
        raise PublishError(f"Cloudflare devolvió key inesperada: {result!r}")
    if result.get("size") not in (None, str(size), size):
        raise PublishError(f"Cloudflare devolvió tamaño inesperado: {result!r}")

    manifest["assets"][logical_id] = entry
    write_manifest(manifest_path, manifest)
    print(f"PUBLISHED {logical_id} -> {entry['url']}")
    return entry


def smoke(config_path: pathlib.Path) -> None:
    config = load_config(config_path)
    token, account_id = require_env()
    payload = b"chess-studio-r2-smoke-v1\n"
    nonce = os.environ.get("GITHUB_SHA", uuid.uuid4().hex)[:16]
    key = f"_smoke/{nonce}.txt"
    uploaded = False
    try:
        upload_object(token, account_id, config["bucket"], key, payload, "text/plain; charset=utf-8")
        uploaded = True
        received = get_object(token, account_id, config["bucket"], key)
        if received != payload:
            raise PublishError(f"Smoke R2 corrupto: esperado {len(payload)} bytes, recibido {len(received)}")
        print(f"OK R2 object upload/get: {key}")
    finally:
        if uploaded:
            try:
                delete_object(token, account_id, config["bucket"], key)
                print(f"OK R2 object delete: {key}")
            except Exception as exc:
                print(f"WARN no se pudo borrar smoke {key}: {exc}", file=sys.stderr)


def self_test() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = pathlib.Path(tmp)
        sample = root / "Matthias Final!!.WEBP"
        sample.write_bytes(b"pawn-slug" * 100)
        digest = sha256_file(sample)
        assert len(digest) == 64
        assert object_key_for(sample, "pawn-slug/matthias", digest).startswith("pawn-slug/matthias/Matthias-Final-")
        assert content_type_for(sample) == "image/webp"
        manifest = blank_manifest("https://assets.example.test")
        manifest["assets"]["pawnSlug.matthias"] = {
            "bytes": sample.stat().st_size,
            "contentType": "image/webp",
            "key": f"pawn-slug/matthias/matthias-{digest[:16]}.webp",
            "sha256": digest,
            "url": f"https://assets.example.test/pawn-slug/matthias/matthias-{digest[:16]}.webp",
        }
        manifest_path = root / "manifest.json"
        write_manifest(manifest_path, manifest)
        validate_manifest(json.loads(manifest_path.read_text(encoding="utf-8")))
    print("OK r2 asset publisher self-test")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)

    pub = sub.add_parser("publish")
    pub.add_argument("source", type=pathlib.Path)
    pub.add_argument("--logical-id", required=True)
    pub.add_argument("--prefix", required=True)
    pub.add_argument("--manifest", type=pathlib.Path, default=DEFAULT_MANIFEST)
    pub.add_argument("--config", type=pathlib.Path, default=DEFAULT_CONFIG)
    pub.add_argument("--dry-run", action="store_true")

    check = sub.add_parser("check-manifest")
    check.add_argument("--manifest", type=pathlib.Path, default=DEFAULT_MANIFEST)
    check.add_argument("--config", type=pathlib.Path, default=DEFAULT_CONFIG)

    remote = sub.add_parser("smoke")
    remote.add_argument("--config", type=pathlib.Path, default=DEFAULT_CONFIG)
    sub.add_parser("self-test")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        if args.command == "publish":
            publish(args.source, args.logical_id, args.prefix, args.manifest, args.config, args.dry_run)
        elif args.command == "check-manifest":
            config = load_config(args.config)
            manifest = load_manifest(args.manifest, f"https://{config['customDomain']}")
            validate_manifest(manifest)
            print(f"OK manifest R2: {args.manifest}")
        elif args.command == "smoke":
            smoke(args.config)
        elif args.command == "self-test":
            self_test()
        return 0
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
