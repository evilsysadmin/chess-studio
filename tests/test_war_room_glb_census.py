"""Blender-independent tests of exported War Room mesh accounting."""
import hashlib
import json
import struct
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts' / 'blender'))
from war_room_glb_census import census_scene, geometry_budget_violations, main, read_glb_json, render_census_markdown, verify_runtime_manifest_provenance  # noqa: E402


def fixture():
    return {
        'scene': 0,
        'scenes': [{'nodes': [0]}],
        'nodes': [
            {'name': 'Room', 'children': [1, 2]},
            {'name': 'Pillar A', 'mesh': 0},
            {'name': 'Pillar B', 'mesh': 0},
            {'name': 'Orphan', 'mesh': 1},
        ],
        'meshes': [
            {'name': 'stone', 'primitives': [{'attributes': {'POSITION': 0}, 'indices': 1}]},
            {'name': 'not in scene', 'primitives': [{'attributes': {'POSITION': 2}}]},
        ],
        'accessors': [{'count': 4}, {'count': 6}, {'count': 300}],
    }


class WarRoomGlbCensusTests(unittest.TestCase):
    def test_scene_references_not_orphan_meshes_and_reused_mesh_twice(self):
        report = census_scene(fixture())
        self.assertEqual(report['meshInstances'], 2)
        self.assertEqual(report['uniqueMeshes'], 1)
        self.assertEqual(report['primitiveInstances'], 2)
        self.assertEqual(report['potentialTriangles'], 4)
        self.assertEqual(report['uniqueMeshTriangles'], 2)
        self.assertEqual(report['topMeshes'], [{
            'meshIndex': 0, 'mesh': 'stone', 'instances': 2,
            'potentialTriangles': 4, 'uniqueTriangles': 2, 'primitiveInstances': 2,
        }])
        self.assertEqual(report['vertexReferences'], 8)
        self.assertEqual(report['materialCosts'], [{
            'materialIndex': -1, 'material': '(unassigned)',
            'potentialTriangles': 4, 'primitiveInstances': 2,
        }])
        self.assertEqual([row['node'] for row in report['topNodes']], ['Pillar A', 'Pillar B'])

    def test_nonindexed_primitive_counts_vertices(self):
        doc = fixture()
        doc['nodes'][1]['mesh'] = 1
        doc['nodes'][0]['children'] = [1]
        report = census_scene(doc)
        self.assertEqual(report['potentialTriangles'], 100)
        self.assertEqual(report['vertexReferences'], 300)

    def test_unreachable_mesh_topology_does_not_contaminate_default_scene(self):
        doc = fixture()
        # The unused mesh may be a line-strip helper for a different scene.
        # A default-scene triangle census must not reject or count it.
        doc['meshes'][1]['primitives'][0]['mode'] = 5
        report = census_scene(doc)
        self.assertEqual(report['potentialTriangles'], 4)
        self.assertEqual(report['uniqueMeshes'], 1)
        # Fail closed when that same previously unused mesh becomes reachable.
        doc['nodes'][0]['children'].append(3)
        with self.assertRaisesRegex(ValueError, 'non-triangle'):
            census_scene(doc)

    def test_invalid_topology_fails_closed(self):
        doc = fixture()
        doc['meshes'][0]['primitives'][0]['mode'] = 5
        with self.assertRaisesRegex(ValueError, 'non-triangle'):
            census_scene(doc)
        doc['meshes'][0]['primitives'][0]['mode'] = 4
        doc['accessors'][1]['count'] = 5
        with self.assertRaisesRegex(ValueError, 'not divisible'):
            census_scene(doc)

    def test_corrupt_references_cycles_and_instancing_fail_closed(self):
        doc = fixture()
        doc['nodes'][2]['mesh'] = 22
        with self.assertRaisesRegex(ValueError, 'invalid mesh'):
            census_scene(doc)
        doc = fixture()
        doc['nodes'][2]['children'] = [0]
        with self.assertRaisesRegex(ValueError, 'cyclic'):
            census_scene(doc)
        doc = fixture()
        doc['nodes'][1]['extensions'] = {'EXT_mesh_gpu_instancing': {}}
        with self.assertRaisesRegex(ValueError, 'GPU instancing'):
            census_scene(doc)

    def test_duplicate_scene_node_references_fail_closed(self):
        # A glTF node has a single parent. Counting a DAG twice would make
        # the per-room potential-triangle census untrustworthy.
        doc = fixture()
        doc['scenes'][0]['nodes'].append(1)
        with self.assertRaisesRegex(ValueError, 'referenced more than once'):
            census_scene(doc)
        doc = fixture()
        doc['nodes'].append({'name': 'Second root', 'children': [1]})
        doc['scenes'][0]['nodes'].append(4)
        with self.assertRaisesRegex(ValueError, 'referenced more than once'):
            census_scene(doc)
        # Duplicates in an unused scene do not alter the active scene census.
        doc = fixture()
        doc['scenes'].append({'nodes': [1, 1]})
        self.assertEqual(census_scene(doc)['meshInstances'], 2)

    def test_unused_scene_ignored_and_top_limited(self):
        doc = fixture()
        doc['scenes'].append({'nodes': [3]})
        self.assertEqual(census_scene(doc, top=1)['meshInstances'], 2)
        self.assertEqual(len(census_scene(doc, top=1)['topNodes']), 1)
        doc['scene'] = 1
        self.assertEqual(census_scene(doc)['potentialTriangles'], 100)
        doc['scene'] = 5
        with self.assertRaisesRegex(ValueError, 'default scene'):
            census_scene(doc)

    def test_ci_summary_identifies_glb_hash_without_claiming_fps(self):
        report = {
            'file': '/tmp/war-room-v3/war-room-v3-shell.glb',
            'sha256': 'b' * 64,
            'glbBytes': 1000,
            **census_scene(fixture(), top=1),
        }
        summary = render_census_markdown([report])
        self.assertIn('war-room-v3-shell.glb', summary)
        self.assertIn('b' * 64, summary)
        self.assertIn('| Pillar A | stone | 2 |', summary)
        self.assertIn('Not** actual GPU draw calls', summary)
        self.assertIn('| (unassigned) | 4 | 2 |', summary)

    def test_top_meshes_rank_accumulated_instances_not_single_nodes(self):
        doc = fixture()
        doc['nodes'][0]['children'].append(3)
        report = census_scene(doc, top=1)
        self.assertEqual(len(report['topMeshes']), 1)
        self.assertEqual(report['topMeshes'][0], {
            'meshIndex': 1, 'mesh': 'not in scene', 'instances': 1,
            'potentialTriangles': 100, 'uniqueTriangles': 100,
            'primitiveInstances': 1,
        })
        self.assertEqual(sum(row['potentialTriangles'] for row in
                             census_scene(doc)['topMeshes']), 104)
        summary = render_census_markdown([{
            'file': 'v3.glb', 'sha256': 'f' * 64, 'glbBytes': 123,
            **census_scene(doc),
        }])
        self.assertIn('Repeated mesh cost across scene instances', summary)
        self.assertIn('| stone | 2 | 4 | 2 |', summary)
        self.assertIn('| not in scene | 1 | 100 | 100 |', summary)

    def test_material_costs_count_scene_instances_and_sort_by_triangles(self):
        doc = fixture()
        doc['materials'] = [{'name': 'granite'}, {'name': 'iron'}]
        doc['meshes'][0]['primitives'][0]['material'] = 0
        doc['meshes'][1]['primitives'][0]['material'] = 1
        doc['nodes'][0]['children'].append(3)
        report = census_scene(doc)
        self.assertEqual(report['potentialTriangles'], 104)
        self.assertEqual(report['primitiveInstances'], 3)
        self.assertEqual(report['materialCosts'], [
            {'materialIndex': 1, 'material': 'iron',
             'potentialTriangles': 100, 'primitiveInstances': 1},
            {'materialIndex': 0, 'material': 'granite',
             'potentialTriangles': 4, 'primitiveInstances': 2},
        ])
        self.assertEqual(sum(row['potentialTriangles'] for row in report['materialCosts']),
                         report['potentialTriangles'])
        summary = render_census_markdown([{'file': '/tmp/v3.glb',
            'sha256': 'a'*64, 'glbBytes': 1000, **report}])
        self.assertIn('| iron | 100 | 1 |', summary)
        self.assertIn('| granite | 4 | 2 |', summary)

    def test_material_references_fail_closed(self):
        doc = fixture()
        doc['meshes'][0]['primitives'][0]['material'] = 0
        with self.assertRaisesRegex(ValueError, 'invalid glTF material'):
            census_scene(doc)
        doc['materials'] = [{'name': 'stone'}]
        doc['meshes'][0]['primitives'][0]['material'] = None
        with self.assertRaisesRegex(ValueError, 'invalid glTF material'):
            census_scene(doc)

    def test_geometry_budget_boundary_and_failure_cause(self):
        report = {'file': 'candidate-v4.glb', 'potentialTriangles': 107888,
                  'glbBytes': 3021880}
        self.assertEqual(geometry_budget_violations(
            report, max_triangles=107888, max_bytes=3021880), [])
        self.assertEqual(len(geometry_budget_violations(
            report, max_triangles=100000, max_bytes=3000000)), 2)
        self.assertIn('107,888', geometry_budget_violations(
            report, max_triangles=100000)[0])
        self.assertEqual(geometry_budget_violations(report), [])

    def test_budget_validation_cli_accepts_only_positive_thresholds(self):
        with self.assertRaises(SystemExit) as error:
            main(['not-present.glb', '--max-triangles', '0'])
        self.assertEqual(error.exception.code, 2)
        with self.assertRaises(SystemExit) as error:
            main(['not-present.glb', '--max-bytes', '-1'])
        self.assertEqual(error.exception.code, 2)

    def test_runtime_manifest_provenance_checks_published_id_hash_bytes_and_filename(self):
        data = b"real glb bytes"
        digest = hashlib.sha256(data).hexdigest()
        entry = {
            "bytes": len(data), "sha256": digest,
            "key": "war-room/v3/runtime/war-room-v3-shell-test.glb",
            "contentType": "model/gltf-binary",
        }
        manifest = {"assets": {
            "warRoom.v2.runtime": {"key": "war-room/v2/runtime/v2.glb",
                                   "sha256": "a"*64, "bytes": 10,
                                   "contentType": "model/gltf-binary"},
            "warRoom.v3.runtime": entry,
            "warRoom.v4.runtime": {"key": "war-room/v4/runtime/v4.glb",
                                   "sha256": "b"*64, "bytes": 10,
                                   "contentType": "model/gltf-binary"},
        }}
        path = Path("/tmp/war-room-v3-shell-test.glb")
        report = {"sha256": digest, "glbBytes": len(data)}
        verified = verify_runtime_manifest_provenance(path, report, manifest)
        self.assertEqual(verified["logicalId"], "warRoom.v3.runtime")
        self.assertEqual(verified["r2Key"], entry["key"])
        with self.assertRaisesRegex(ValueError, "provenance mismatch"):
            verify_runtime_manifest_provenance(path, {**report, "sha256": "0"*64}, manifest)
        with self.assertRaisesRegex(ValueError, "provenance mismatch"):
            verify_runtime_manifest_provenance(path, {**report, "glbBytes": len(data)+1}, manifest)
        with self.assertRaisesRegex(ValueError, "no unique"):
            verify_runtime_manifest_provenance(Path("/tmp/other.glb"), report, manifest)
        with self.assertRaisesRegex(ValueError, "invalid runtime key"):
            verify_runtime_manifest_provenance(path, report, {
                "assets": {**manifest["assets"],
                           "warRoom.v3.runtime": {**entry, "key": "../bad.glb"}},
            })
        with self.assertRaisesRegex(ValueError, "invalid manifest SHA"):
            verify_runtime_manifest_provenance(path, report, {
                "assets": {**manifest["assets"],
                           "warRoom.v3.runtime": {**entry, "sha256": "unknown"}},
            })
        with self.assertRaisesRegex(ValueError, "no assets object"):
            verify_runtime_manifest_provenance(path, report, {})

    def test_runtime_manifest_cli_reports_verified_published_glb(self):
        document = fixture()
        body = json.dumps(document).encode("utf-8")
        body += b" " * (-len(body) % 4)
        binary = b"\\0" * 4
        raw = (struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(body) + 8 + len(binary))
               + struct.pack("<II", len(body), 0x4E4F534A) + body
               + struct.pack("<II", len(binary), 0x004E4942) + binary)
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            glb = folder / "v3-published.glb"
            glb.write_bytes(raw)
            assets = {}
            for variant in ("v2", "v3", "v4"):
                assets[f"warRoom.{variant}.runtime"] = {
                    "key": f"war-room/{variant}/runtime/"
                           + ("v3-published.glb" if variant == "v3" else f"{variant}.glb"),
                    "bytes": len(raw),
                    "sha256": hashlib.sha256(raw).hexdigest(),
                    "contentType": "model/gltf-binary",
                }
            manifest = folder / "manifest.json"
            manifest.write_text(json.dumps({"assets": assets}), encoding="utf-8")
            result = folder / "census.json"
            self.assertEqual(main([str(glb), "--runtime-manifest", str(manifest),
                                   "--output-json", str(result)]), 0)
            report = json.loads(result.read_text(encoding="utf-8"))[0]
            self.assertEqual(report["potentialTriangles"], 4)
            self.assertEqual(report["runtimeManifestProvenance"]["logicalId"],
                             "warRoom.v3.runtime")
            self.assertEqual(report["runtimeManifestProvenance"]["sha256"],
                             hashlib.sha256(raw).hexdigest())

            assets["warRoom.v3.runtime"]["sha256"] = "0" * 64
            manifest.write_text(json.dumps({"assets": assets}), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "provenance mismatch"):
                main([str(glb), "--runtime-manifest", str(manifest)])

    def test_glb_reader_accepts_meshopt_buffer_layout(self):
        # Meshopt can preserve decoded buffer metadata but store a short
        # compressed binary chunk; no equality between those lengths required.
        document = fixture()
        document["buffers"] = [{"byteLength": 4096, "name": "decoded"}]
        document["extensionsUsed"] = ["EXT_meshopt_compression"]
        document["bufferViews"] = [
            {"byteLength": 40, "extensions": {
                "EXT_meshopt_compression": {"buffer": 0, "byteOffset": 0,
                                            "byteLength": 4, "byteStride": 4,
                                            "count": 10, "mode": "ATTRIBUTES"}
            }}
        ]
        body = json.dumps(document).encode()
        body += b" " * (-len(body) % 4)
        binary = b"\0" * 4
        raw = (struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(body) + 8 + len(binary))
               + struct.pack("<II", len(body), 0x4E4F534A) + body
               + struct.pack("<II", len(binary), 0x004E4942) + binary)
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / "meshopt.glb"
            file.write_bytes(raw)
            decoded = read_glb_json(file)
            self.assertEqual(census_scene(decoded)["potentialTriangles"], 4)
            with self.assertRaisesRegex(ValueError, "invalid GLB header"):
                file.write_bytes(raw[:-1])
                read_glb_json(file)
            with self.assertRaisesRegex(ValueError, "JSON must be first"):
                file.write_bytes(
                    struct.pack("<4sII", b"glTF", 2, len(raw))
                    + struct.pack("<II", len(binary), 0x004E4942) + binary
                    + struct.pack("<II", len(body), 0x4E4F534A) + body
                )
                read_glb_json(file)


if __name__ == '__main__':
    unittest.main()
