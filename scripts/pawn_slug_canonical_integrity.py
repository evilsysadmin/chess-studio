"""Offline canonical/R2 integrity gate; no image tooling or network required in CI."""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'frontend/src/assets/pawnSlug'
MANIFEST_PATH = ROOT / 'frontend/src/assets/r2-assets-manifest.json'
PUBLIC_ORIGIN = 'https://assets.chess-studio.shadowops.dpdns.org'
REQUIRED = {
    'pawnSlug.matthias.canonicalMaster': 'image/png',
    'pawnSlug.matthias.pistol': 'image/webp',
    'pawnSlug.matthias.pistolShoot': 'image/webp',
    'pawnSlug.matthias.machinegun': 'image/webp',
    'pawnSlug.matthias.shotgun': 'image/webp',
    'pawnSlug.matthias.panzerfaust': 'image/webp',
    'pawnSlug.matthias.motion': 'image/webp',
}
SHA256_RE = re.compile(r'^[0-9a-f]{64}$')
LEGACY_PISTOL_FALLBACK_SHA256 = '42a01598d26b6dedb7f0bfa70c392c6cbd80df9cea1bea7c7224f9a6d8cf2829'
LEGACY_PISTOL_FALLBACK_BYTES = 130478
PISTOL_V4_SHA256 = '8d06b70e1ea9ce2735c8e9b01d5952022770fc4d355f49f3c683986287b7b259'
PISTOL_V4_BYTES = 515130

meta = json.loads((ASSETS / 'matthias_canonical_pistol_v1.json').read_text())
manifest = json.loads(MANIFEST_PATH.read_text())
entries = manifest['assets']

assert manifest['version'] == 1
assert manifest['baseUrl'] == PUBLIC_ORIGIN
assert {
    logical_id for logical_id in entries if logical_id.startswith('pawnSlug.matthias.')
} == set(REQUIRED)

for logical_id, content_type in REQUIRED.items():
    entry = entries[logical_id]
    digest = entry['sha256']
    extension = '.png' if content_type == 'image/png' else '.webp'

    assert isinstance(entry['bytes'], int) and entry['bytes'] > 0
    assert entry['contentType'] == content_type
    assert SHA256_RE.fullmatch(digest)
    assert entry['key'].startswith('pawn-slug/matthias/')
    assert entry['key'].endswith(f'-{digest[:16]}{extension}')
    assert entry['url'] == f"{PUBLIC_ORIGIN}/{entry['key']}"

master = entries['pawnSlug.matthias.canonicalMaster']
assert meta['masterSha256'] == master['sha256']

# The runtime pistol bank is now an immutable R2-only v4 atlas. The tracked v1
# WebP remains only as a legacy/local fallback fixture and must be validated
# independently instead of being forced to match the current R2 logical asset.
pistol = entries['pawnSlug.matthias.pistol']
assert pistol['sha256'] == PISTOL_V4_SHA256
assert pistol['bytes'] == PISTOL_V4_BYTES
assert pistol['key'] == f'pawn-slug/matthias/pistol/matthias_pistol_canonical_v4-{PISTOL_V4_SHA256[:16]}.webp'

runtime = (ASSETS / 'matthias_canonical_pistol_v1.webp').read_bytes()
assert hashlib.sha256(runtime).hexdigest() == LEGACY_PISTOL_FALLBACK_SHA256
assert len(runtime) == LEGACY_PISTOL_FALLBACK_BYTES
assert runtime[:4] == b'RIFF' and runtime[8:16] == b'WEBPVP8L'
bits = int.from_bytes(runtime[21:25], 'little')
assert ((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1) == (meta['width'], meta['height'])
assert (bits >> 28) & 1, 'Legacy fallback atlas must retain alpha'

print('Pawn Slug canonical manifest + R2 pistol v4 + legacy fallback integrity: OK')
