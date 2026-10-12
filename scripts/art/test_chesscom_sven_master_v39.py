#!/usr/bin/env python3
"""V39 quarantined GLB review: file identity, alpha, eight views and no promotion."""
from __future__ import annotations
import hashlib, json, tempfile, unittest
from pathlib import Path
from PIL import Image

GIT_BLOB='280b2776eee2af7e131db22dd7a32b1e99764a12'
DIRECTIONS=('N','NE','E','SE','S','SW','W','NW')

def validate_source(path):
    payload=Path(path).read_bytes()
    if payload[:4]!=b'glTF': raise ValueError('bad-glb')
    sha=hashlib.sha1(b'blob '+str(len(payload)).encode()+b'\0'+payload).hexdigest()
    if sha!=GIT_BLOB: raise ValueError('glb-hash-mismatch')
    return hashlib.sha256(payload).hexdigest()

def validate_previews(path):
    p=Path(path);m=json.loads((p/'candidate-manifest.json').read_text())
    if (m.get('identity')!='chesscom-sven-model-candidate-v39' or
        m.get('review_only') is not True or m.get('NOT_a_production_sprite_bank') is not True):
        raise ValueError('invalid-candidate')
    if m.get('source',{}).get('git_blob')!=GIT_BLOB:raise ValueError('unverified-source')
    if sorted(m.get('directions',{}))!=sorted(DIRECTIONS):raise ValueError('missing-views')
    for d in DIRECTIONS:
        meta=m['directions'][d];file=p/f'sven-model-{d}.png'
        if meta.get('file')!=file.name:raise ValueError('invalid-name')
        data=file.read_bytes()
        if hashlib.sha256(data).hexdigest()!=meta.get('sha256'):raise ValueError('tampered-render')
        with Image.open(file) as im:
            if im.size!=(256,384):raise ValueError('bad-resolution')
            alpha=im.convert('RGBA').getchannel('A')
            amin,amax=alpha.getextrema()
            if amin!=0 or amax<230:raise ValueError('missing-transparent-figure')
    return m

class SourceContractTests(unittest.TestCase):
    def test_reject_bad_master(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'master.glb'
            path.write_bytes(b'not glb')
            with self.assertRaisesRegex(ValueError,'bad-glb'):validate_source(path)
            path.write_bytes(b'glTFfake')
            with self.assertRaisesRegex(ValueError,'hash-mismatch'):validate_source(path)
    def test_never_accept_mislabeled_runtime_asset(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)
            (path/'candidate-manifest.json').write_text(json.dumps({
                'identity':'chesscom-sven-model-candidate-v39',
                'review_only':False,'NOT_a_production_sprite_bank':True}))
            with self.assertRaisesRegex(ValueError,'invalid-candidate'):validate_previews(path)

if __name__=='__main__':unittest.main()
