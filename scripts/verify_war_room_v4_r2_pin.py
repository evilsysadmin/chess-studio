#!/usr/bin/env python3
"""Fail-closed integrity check for the *public* immutable War Room V4 GLB.

CI must use HTTP mode (default); --file is for offline byte-validation only.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import struct
import sys
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit

ASSET = 'warRoom.v4.runtime'
ORIGIN = 'https://assets.chess-studio.shadowops.dpdns.org'
PREFIX = 'war-room/v4/runtime/war-room-v4-shell-'
MAX_BYTES = 4_500_000
NODES = {'WR_HANS_door_leaf', 'WR_ANCHOR_hans_door', 'WR_ANCHOR_hans_hearth'}


def check_entry(entry):
    sha, size = entry.get('sha256'), entry.get('bytes')
    if not isinstance(sha, str) or not re.fullmatch(r'[a-f0-9]{64}', sha):
        raise ValueError('invalid manifest SHA256')
    if type(size) is not int or not 60_000 < size <= MAX_BYTES:
        raise ValueError('invalid manifest GLB size')
    key = PREFIX + sha[:16] + '.glb'
    if (entry.get('key') != key or entry.get('url') != ORIGIN + '/' + key
            or entry.get('contentType') != 'model/gltf-binary'):
        raise ValueError('manifest must use the immutable content-addressed R2 key')
    uri = urlsplit(entry['url'])
    if uri.scheme != 'https' or uri.hostname != 'assets.chess-studio.shadowops.dpdns.org' or uri.query or uri.fragment or uri.username:
        raise ValueError('unexpected R2 origin or URL parameters')


def check_bytes(data, entry):
    if len(data) != entry['bytes']:
        raise ValueError(f'R2 GLB size differs: {len(data)} != {entry["bytes"]}')
    digest = hashlib.sha256(data).hexdigest()
    if digest != entry['sha256']:
        raise ValueError(f'R2 GLB sha256 differs: {digest} != {entry["sha256"]}')
    if len(data) < 24 or data[:4] != b'glTF' or struct.unpack_from('<II', data, 4) != (2, len(data)):
        raise ValueError('bad glTF binary header')
    length, chunk_type = struct.unpack_from('<II', data, 12)
    if chunk_type != 0x4e4f534a or not 20 < length < len(data) - 20:
        raise ValueError('bad glTF JSON chunk')
    model = json.loads(data[20:20 + length].rstrip(b' \t\r\n\x00'))
    names = {n.get('name') for n in model.get('nodes', [])}
    if not NODES.issubset(names):
        raise ValueError('missing dynamic Hans door or authored walking anchors')
    return digest


def fetch(url):
    req = urllib.request.Request(url, headers={
        'User-Agent': 'chess-studio-v4-integrity/1',
        'Cache-Control': 'no-cache',
    })
    class RejectRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, request, fp, code, msg, headers, newurl):
            raise ValueError(f'R2 redirected away from immutable URL: {code}')
    with urllib.request.build_opener(RejectRedirect).open(req, timeout=45) as res:
        if res.status != 200:
            raise ValueError(f'R2 returned HTTP {res.status}')
        return res.read(MAX_BYTES + 1)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest', type=Path, default=Path('frontend/src/assets/r2-assets-manifest.json'))
    parser.add_argument('--file', type=Path, help='Local smoke only; NEVER use in the CI public-R2 job')
    args = parser.parse_args()
    try:
        entry = json.loads(args.manifest.read_text(encoding='utf8'))['assets'][ASSET]
        check_entry(entry)
        if args.file:
            data = args.file.read_bytes()
        else:
            for attempt in range(3):
                try:
                    data = fetch(entry['url'])
                    break
                except (urllib.error.URLError, TimeoutError) as exc:
                    if attempt == 2:
                        raise RuntimeError(f'public R2 request failed: {exc}') from exc
                    time.sleep(2 * (attempt + 1))
        digest = check_bytes(data, entry)
    except (OSError, ValueError, KeyError, RuntimeError, json.JSONDecodeError) as exc:
        print(f'V4_R2_PIN_FAILED: {exc}', file=sys.stderr)
        return 1
    print(f'V4_R2_PIN_VERIFIED sha256={digest} bytes={len(data)} source={"local" if args.file else "public-r2"} key={entry["key"]}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
