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

pistol = entries['pawnSlug.matthias.pistol']
runtime = (ASSETS / 'matthias_canonical_pistol_v1.webp').read_bytes()
assert hashlib.sha256(runtime).hexdigest() == pistol['sha256']
assert len(runtime) == pistol['bytes']
assert runtime[:4] == b'RIFF' and runtime[8:16] == b'WEBPVP8L'
bits = int.from_bytes(runtime[21:25], 'little')
assert ((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1) == (meta['width'], meta['height'])
assert (bits >> 28) & 1, 'Runtime atlas must retain alpha'

print('Pawn Slug canonical manifest + local pistol fallback integrity: OK')
