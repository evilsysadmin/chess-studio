"""Offline canonical/R2 integrity gate; no image tooling or network required in CI."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'frontend/src/assets/pawnSlug'
MANIFEST_PATH = ROOT / 'frontend/src/assets/r2-assets-manifest.json'
MASTER_SHA256 = '9c21264274777d012a2941073f6cbae94df090db0459624e6031207c0a288c5f'
PUBLIC_ORIGIN = 'https://assets.chess-studio.shadowops.dpdns.org'

meta = json.loads((ASSETS / 'matthias_canonical_pistol_v1.json').read_text())
manifest = json.loads(MANIFEST_PATH.read_text())
entries = manifest['assets']

assert manifest['version'] == 1
assert manifest['baseUrl'] == PUBLIC_ORIGIN
assert meta['masterSha256'] == MASTER_SHA256

expected = {
    'pawnSlug.matthias.canonicalMaster': (3119009, 'image/png', MASTER_SHA256),
    'pawnSlug.matthias.pistol': (130478, 'image/webp', '42a01598d26b6dedb7f0bfa70c392c6cbd80df9cea1bea7c7224f9a6d8cf2829'),
    'pawnSlug.matthias.machinegun': (280618, 'image/webp', 'ed37fd69ea1f6ae92e1083f84b6bd884054fed2873d96ad84ff02f0ad2bf9edb'),
    'pawnSlug.matthias.shotgun': (520794, 'image/webp', '5462a87a3aa338f418b2ab64e9d678ab2d08ca15bb1b6d2f787c4f7c795ff2aa'),
    'pawnSlug.matthias.panzerfaust': (554348, 'image/webp', '613be27822aea57cae2b64c1b19f3546df307dd567597d9d61cff1c17c6bac35'),
    'pawnSlug.matthias.motion': (9334, 'image/webp', '85988118befde41238cedc4ba772af38d08789bdcfb1671e874ff6743470c393'),
}

for logical_id, (size, content_type, digest) in expected.items():
    entry = entries[logical_id]
    assert entry['bytes'] == size
    assert entry['contentType'] == content_type
    assert entry['sha256'] == digest
    assert f'-{digest[:16]}.' in entry['key']
    assert entry['url'] == f"{PUBLIC_ORIGIN}/{entry['key']}"

runtime = (ASSETS / 'matthias_canonical_pistol_v1.webp').read_bytes()
assert hashlib.sha256(runtime).hexdigest() == expected['pawnSlug.matthias.pistol'][2]
assert len(runtime) == expected['pawnSlug.matthias.pistol'][0]
assert runtime[:4] == b'RIFF' and runtime[8:16] == b'WEBPVP8L'
bits = int.from_bytes(runtime[21:25], 'little')
assert ((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1) == (meta['width'], meta['height'])
assert (bits >> 28) & 1, 'Runtime atlas must retain alpha'

print('Pawn Slug canonical manifest + local pistol fallback integrity: OK')
