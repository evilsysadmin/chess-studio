#!/usr/bin/env python3
"""Sven head study must never masquerade as a finished master."""
from pathlib import Path
import hashlib,json,struct,tempfile,unittest
DIRECTIONS=('N','NE','E','SE','S','SW','W','NW')
SRC=Path(__file__).resolve().parents[2]/'scripts/blender/chesscom_sven_head_v43.py'
def validate(path):
    path=Path(path);m=json.loads((path/'review.json').read_text())
    if (m.get('identity')!='chesscom-sven-head-study-v43' or
        m.get('head_only') is not True or m.get('full_character') is not False or
        m.get('approved') is not False or m.get('animation_bank') is not False or
        m.get('review_only') is not True):raise ValueError('attempted-promotion')
    if set(m.get('directions',{}))!=set(DIRECTIONS):raise ValueError('missing-direction')
    seen=set()
    for d in DIRECTIONS:
        png=path/f'sven-head-{d}.png'
        image=png.read_bytes()
        if image[:8]!=b'\x89PNG\r\n\x1a\n':raise ValueError('invalid-png')
        if struct.unpack('>II',image[16:24])!=(512,512):raise ValueError('bad-resolution')
        digest=hashlib.sha256(image).hexdigest()
        if m['directions'][d]!=dict(file=png.name,sha256=digest):raise ValueError('bad-hash')
        if digest in seen:raise ValueError('duplicate-views')
        seen.add(digest)
    glb=(path/'sven-head-v43.glb').read_bytes()
    if glb[:4]!=b'glTF' or hashlib.sha256(glb).hexdigest()!=m.get('glb_sha256'):
        raise ValueError('invalid-glb')
    if not (path/'sven-head-v43.blend').is_file():raise ValueError('missing-editable-master')
    return m
class Tests(unittest.TestCase):
    def test_canonical_features_and_no_outside_model(self):
        source=SRC.read_text().lower()
        for banned in ('dullmesh','quaternius','mixamo','raw.githubusercontent.com'):
            self.assertNotIn(banned,source)
        for term in ('sven43_anatomical-balaclava','sven43_molded-helmet',
                     'sven43_mic-boom','sven43_scout-cowl'):
            self.assertIn(term,source)
    def test_reject_laundered_complete_character(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)
            (p/'review.json').write_text(json.dumps({
                'identity':'chesscom-sven-head-study-v43','head_only':True,
                'full_character':True,'approved':False,'animation_bank':False,
                'review_only':True}))
            with self.assertRaisesRegex(ValueError,'attempted-promotion'):validate(p)
if __name__=='__main__':unittest.main()
