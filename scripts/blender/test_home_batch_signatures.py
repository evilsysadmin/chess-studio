"""Conservative, dependency-free Home static batching contract tests."""
import unittest
from home_batch_signatures import static_material_batch_key, avoided_ordered_meshes


class StaticMaterialBatchKeys(unittest.TestCase):
    def test_reverse_opaque_multimaterial_order_shares_bucket(self):
        a = static_material_batch_key([("HOME_MAT_brass", True), ("HOME_MAT_wood", True)])
        b = static_material_batch_key([("HOME_MAT_wood", True), ("HOME_MAT_brass", True)])
        self.assertEqual(a, b)
        self.assertEqual(a, ("opaque-set", ("HOME_MAT_brass", "HOME_MAT_wood")))
        self.assertEqual(avoided_ordered_meshes([("HOME_MAT_brass", "HOME_MAT_wood"),
                                               ("HOME_MAT_wood", "HOME_MAT_brass")]), 1)

    def test_one_material_stays_in_historic_bucket(self):
        self.assertEqual(static_material_batch_key([("HOME_MAT_stone", True)]),
                         ("ordered", ("HOME_MAT_stone",)))

    def test_transparent_slots_remain_order_sensitive(self):
        a = static_material_batch_key([("glass", False), ("wood", True)])
        b = static_material_batch_key([("wood", True), ("glass", False)])
        self.assertNotEqual(a, b)

    def test_duplicate_and_missing_materials_do_not_merge_across_order(self):
        a = static_material_batch_key([("wood", True), ("wood", True), ("brass", True)])
        b = static_material_batch_key([("brass", True), ("wood", True), ("wood", True)])
        self.assertNotEqual(a, b)
        self.assertNotEqual(static_material_batch_key([("", False), ("wood", True)]),
                            static_material_batch_key([("wood", True), ("", False)]))

    def test_no_fake_savings_from_same_order_or_one_batch(self):
        self.assertEqual(avoided_ordered_meshes([]), 0)
        self.assertEqual(avoided_ordered_meshes([("stone",)]), 0)
        self.assertEqual(avoided_ordered_meshes([("wood", "brass"), ("wood", "brass")]), 0)
        self.assertEqual(avoided_ordered_meshes([
            ("wood", "brass"), ("brass", "wood"), ("wood", "brass"),
        ]), 1)


if __name__ == "__main__":
    unittest.main()
