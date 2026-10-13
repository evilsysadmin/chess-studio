#!/usr/bin/env python3
"""Source-provenance tests; no generated 3D art or synthetic animation frames."""
from __future__ import annotations
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from PIL import Image, ImageChops
from chesscom_sven_turnaround_v48 import load_contract, prepare, DIRECTIONS


def fixture(root: Path):
    golden = root / 'golden.png'
    sheet = root / 'sheet.png'
    Image.new('RGB', (128, 96), (29, 42, 53)).save(golden)
    multiview = Image.new('RGB', (160, 64), (6, 9, 12))
    for i in range(8):
        for x in range(i*20, (i+1)*20):
            for y in range(8, 50):
                multiview.putpixel((x, y), (i*23, 30+i, 65+i))
    multiview.save(sheet)
    contract = {
        'identity': 'chesscom-sven-eight-view-reference-v48', 'review_only': True,
        'golden': {'sha256': hashlib.sha256(golden.read_bytes()).hexdigest(), 'size': [128, 96]},
        'sheet': {'sha256': hashlib.sha256(sheet.read_bytes()).hexdigest(), 'size': [160, 64]},
        'views': [{'direction': d, 'box': [i*20, 8, (i+1)*20, 50]}
                  for i,d in enumerate(DIRECTIONS)]
    }
    metadata = root / 'contract.json'
    metadata.write_text(json.dumps(contract))
    return golden, sheet, metadata, contract


class TurnaroundReferenceTests(unittest.TestCase):
    def test_eight_real_views_pixel_exact_and_review_only(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            golden, sheet, contract, _ = fixture(root)
            output = root / 'ref'
            report = prepare(golden, sheet, output, contract)
            self.assertEqual(report['readiness'], 'multiview-concept-reference-available')
            self.assertEqual(report['view_count'], 8)
            self.assertFalse(report['skinned_3d_mesh_present'])
            self.assertFalse(report['runtime_ready'])
            self.assertFalse(report['auto_image_to_3d_ready'])
            self.assertFalse(report['source_uploaded_externally'])
            self.assertEqual(report['external_cost_incurred'], 0)
            self.assertEqual(len(list(output.glob('sven-reference-*.png'))), 8)
            for record in report['views']:
                with Image.open(sheet) as source, Image.open(output / record['file']) as crop:
                    self.assertEqual(list(crop.size), [20, 42])
                    self.assertIsNone(ImageChops.difference(
                        source.crop(record['box']), crop).getbbox())
            persisted = json.loads((output / 'reference-manifest.json').read_text())
            self.assertEqual(persisted['sheet_sha256'], report['sheet_sha256'])

    def test_forged_or_mismatched_source_fails_before_output(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            golden, sheet, contract, _ = fixture(root)
            sheet.write_bytes(sheet.read_bytes() + b'tampered')
            with self.assertRaisesRegex(ValueError, 'sheet-sha256-mismatch'):
                prepare(golden, sheet, root / 'out', contract)
            self.assertFalse((root / 'out').exists())
            golden.write_bytes(golden.read_bytes() + b'tampered')
            with self.assertRaisesRegex(ValueError, 'golden-sha256-mismatch'):
                prepare(golden, sheet, root / 'out', contract)

    def test_bad_contract_rejected_before_output(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            golden, sheet, contract, data = fixture(root)
            for mutate, err in [
                (lambda c: c['views'].pop(), 'incomplete-turnaround-views'),
                (lambda c: c['views'][1].update(direction='front'), 'turnaround-direction-order-mismatch'),
                (lambda c: c['views'][1].update(box=[0, 8, 20, 50]), 'duplicate-turnaround-crop'),
                (lambda c: c['views'][1].update(box=[10, 8, 30, 50]), 'overlapping-turnaround-crops'),
                (lambda c: c['views'][1].update(box=[0, 8, 180, 50]), 'invalid-turnaround-crop'),
            ]:
                modified = json.loads(json.dumps(data))
                mutate(modified)
                contract.write_text(json.dumps(modified))
                with self.subTest(err=err), self.assertRaisesRegex(ValueError, err):
                    prepare(golden, sheet, root / 'out', contract)
            self.assertFalse((root / 'out').exists())

    def test_source_layout_not_silently_changed(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            golden, sheet, contract, _ = fixture(root)
            Image.new('RGBA', (160, 64), (10, 20, 30, 255)).save(sheet)
            data = json.loads(contract.read_text())
            data['sheet']['sha256'] = hashlib.sha256(sheet.read_bytes()).hexdigest()
            contract.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError, 'sheet-png-layout-mismatch'):
                prepare(golden, sheet, root / 'out', contract)


if __name__ == '__main__':
    unittest.main()
