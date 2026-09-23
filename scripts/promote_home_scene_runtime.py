#!/usr/bin/env python3
"""Promote an already-published home.scene.runtime R2 object.

Publishing a Blender runtime GLB to R2 (see home-blender-v2-runtime.yml)
does not make the live app load it: the manifest has to point at the exact
hash. Blender's export isn't byte-deterministic, so this can only run
*after* a real publish, once the exact key/sha256/bytes/url are known --
never guess or recompute them, always take them from the publish step.

This only writes local files; it never touches R2 or git itself. The
caller (a human doing a manual promotion, or the CI gate/promote job) is
responsible for the actual commit.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import r2_asset_publisher as core  # noqa: E402

LOGICAL_ID = "home.scene.runtime"
DEFAULT_MANIFEST = Path("frontend/src/assets/r2-assets-manifest.json")
DEFAULT_TEST = Path("frontend/src/components/HomeCastle3DR2Asset.test.js")
DEFAULT_BASE_URL = "https://assets.chess-studio.shadowops.dpdns.org"


def update_test_pin(test_path: Path, key: str) -> bool:
    if not test_path.exists():
        return False
    text = test_path.read_text(encoding="utf-8")
    pattern = re.compile(
        r"(\['home\.scene\.runtime', '/home/scene/canonical/)home-v2-runtime-[0-9a-f]+\.glb('\])"
    )
    filename = key.rsplit("/", 1)[-1]
    new_text, count = pattern.subn(rf"\g<1>{filename}\g<2>", text)
    if count == 0:
        raise core.PublishError(f"No home.scene.runtime pin found in {test_path}")
    if new_text == text:
        return False
    test_path.write_text(new_text, encoding="utf-8")
    return True


def promote(
    key: str,
    sha256: str,
    size: int,
    content_type: str,
    manifest_path: Path,
    test_path: Path,
    base_url: str,
) -> dict[str, object]:
    if not re.fullmatch(r"[0-9a-f]{64}", sha256):
        raise core.PublishError(f"sha256 inválido: {sha256!r}")
    if size <= 0:
        raise core.PublishError(f"bytes inválido: {size!r}")
    entry = {
        "bytes": size,
        "contentType": content_type,
        "key": key,
        "sha256": sha256,
        "url": f"{base_url.rstrip('/')}/{key}",
    }
    manifest = core.load_manifest(manifest_path, base_url)
    manifest_changed = manifest["assets"].get(LOGICAL_ID) != entry
    if manifest_changed:
        manifest["assets"][LOGICAL_ID] = entry
        core.write_manifest(manifest_path, manifest)
    test_changed = update_test_pin(test_path, key)
    return {"entry": entry, "manifest_changed": manifest_changed, "test_changed": test_changed}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--key", required=True, help="R2 object key, e.g. home/scene/canonical/home-v2-runtime-<hash>.glb")
    parser.add_argument("--sha256", required=True)
    parser.add_argument("--bytes", required=True, type=int)
    parser.add_argument("--content-type", default="model/gltf-binary")
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--test", type=Path, default=DEFAULT_TEST)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    args = parser.parse_args()

    try:
        result = promote(
            args.key,
            args.sha256,
            args.bytes,
            args.content_type,
            args.manifest,
            args.test,
            args.base_url,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    if not result["manifest_changed"] and not result["test_changed"]:
        print("UNCHANGED: already promoted")
        return 0
    print(f"PROMOTED {LOGICAL_ID} -> {result['entry']['url']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
