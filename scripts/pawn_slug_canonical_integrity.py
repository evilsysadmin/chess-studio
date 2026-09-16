"""Offline binary integrity gate; no image tooling required in CI."""
import hashlib
import json
import struct
from pathlib import Path

assets = Path(__file__).resolve().parents[1] / 'frontend/src/assets/pawnSlug'
master = (assets / 'matthias_canonical_sprite_sheet_v1.png').read_bytes()
assert hashlib.sha256(master).hexdigest() == '9c21264274777d012a2941073f6cbae94df090db0459624e6031207c0a288c5f'
assert struct.unpack('>II', master[16:24]) == (1536, 1024)
meta = json.loads((assets / 'matthias_canonical_pistol_v1.json').read_text())
assert meta['masterSha256'] == hashlib.sha256(master).hexdigest()
runtime = (assets / 'matthias_canonical_pistol_v1.webp').read_bytes()
assert runtime[:4] == b'RIFF' and runtime[8:16] == b'WEBPVP8L'
assert len(runtime) < 200_000
bits = int.from_bytes(runtime[21:25], 'little')
assert ((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1) == (meta['width'], meta['height'])
assert (bits >> 28) & 1, 'Runtime atlas must retain alpha'
print('Pawn Slug canonical master + runtime integrity: OK')
