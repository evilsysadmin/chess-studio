#!/usr/bin/env python3
"""Census immutable published War Room V2/V3/V4 R2 GLBs. Not a GPU benchmark."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import tempfile
import urllib.request
from pathlib import Path

from war_room_glb_census import (
    census_scene, read_glb_json, render_census_markdown,
    verify_runtime_manifest_provenance,
)

R2_ORIGIN = "https://assets.chess-studio.shadowops.dpdns.org"
VARIANTS = ("v2", "v3", "v4")
MAX_GLB_BYTES = 16 * 1024 * 1024


def audit_published_glbs(manifest: dict, directory: Path, *, opener=None, top=12) -> list[dict]:
    assets = manifest.get("assets")
    if not isinstance(assets, dict) or manifest.get("baseUrl") != R2_ORIGIN:
        raise ValueError("untrusted R2 manifest or origin")
    fetch = opener or urllib.request.urlopen
    directory.mkdir(parents=True, exist_ok=True)
    reports = []
    for variant in VARIANTS:
        logical_id = f"warRoom.{variant}.runtime"
        entry = assets.get(logical_id)
        if not isinstance(entry, dict):
            raise ValueError(f"missing {logical_id}")
        key = entry.get("key")
        if not isinstance(key, str) or not key.startswith(f"war-room/{variant}/runtime/"):
            raise ValueError(f"{logical_id}: invalid runtime key")
        filename = Path(key).name
        if not filename.endswith(".glb") or not filename.startswith("war-room-"):
            raise ValueError(f"{logical_id}: invalid runtime filename")
        url = f"{R2_ORIGIN}/{key}"
        if entry.get("url") != url:
            raise ValueError(f"{logical_id}: noncanonical immutable URL")
        digest = entry.get("sha256")
        size = entry.get("bytes")
        if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest):
            raise ValueError(f"{logical_id}: invalid SHA-256")
        if type(size) is not int or not 0 < size <= MAX_GLB_BYTES:
            raise ValueError(f"{logical_id}: invalid size")
        if entry.get("contentType") != "model/gltf-binary":
            raise ValueError(f"{logical_id}: not a GLB")
        with fetch(url, timeout=30) as response:
            raw = response.read(size + 1)
        actual_sha = hashlib.sha256(raw).hexdigest()
        if len(raw) != size or actual_sha != digest:
            raise ValueError(f"{logical_id}: downloaded R2 GLB differs from pinned bytes/SHA-256")
        path = directory / filename
        if path.exists():
            raise ValueError(f"{logical_id}: duplicate GLB filename")
        path.write_bytes(raw)
        report = {"file": str(path), "variant": variant, "sha256": actual_sha,
                  "glbBytes": len(raw), **census_scene(read_glb_json(path), top=top)}
        report["runtimeManifestProvenance"] = verify_runtime_manifest_provenance(path, report, manifest)
        if report["meshInstances"] <= 0 or report["potentialTriangles"] <= 0:
            raise ValueError(f"{logical_id}: no default-scene geometry")
        reports.append(report)
    return reports


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output-json", type=Path, required=True)
    parser.add_argument("--summary-file", type=Path)
    parser.add_argument("--top", type=int, default=20)
    args = parser.parse_args(argv)
    if args.top < 0:
        parser.error("--top must be nonnegative")
    manifest_bytes = args.manifest.read_bytes()
    manifest = json.loads(manifest_bytes)
    if not isinstance(manifest, dict):
        raise ValueError("manifest JSON is not an object")
    with tempfile.TemporaryDirectory(prefix="war-room-published-") as directory:
        reports = audit_published_glbs(manifest, Path(directory), top=args.top)
    for row in reports:
        row["manifestSha256"] = hashlib.sha256(manifest_bytes).hexdigest()
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(reports, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    summary = render_census_markdown(reports)
    if args.summary_file:
        with args.summary_file.open("a", encoding="utf-8") as target:
            target.write("## Published immutable R2 assets (SHA-verified)\n\n" + summary)
    print(summary)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
