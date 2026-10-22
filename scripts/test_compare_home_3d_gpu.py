"""Stdlib-only contract tests for a trustworthy Home hardware-GPU A/B report."""
import copy
import unittest

from compare_home_3d_gpu import IncomparableBenchmarks, compare_reports, format_comparison


def report(sha, gpu=4.0):
    visits = [
        {
            "visit": n, "actual": "hardware", "software": False,
            "vendor": "nvidia", "rendererFingerprint": "7a1f2c3b",
            "lod": "full", "ambient": "day",
            "canvasWidth": 1440, "canvasHeight": 900,
            "initialDrawCalls": 280, "initialTriangles": 15000,
            "allocatedTextures": 22, "allocatedGeometries": 40,
            "modelRequests": 2, "startupMs": 850,
        }
        for n in range(1, 4)
    ]
    return {
        "schema": 2, "surface": "Home Blender 3D", "mode": "hardware",
        "revision": sha, "browserVersion": "154.0.0.0",
        "viewport": {"width": 1440, "height": 900, "dpr": 1},
        "requireTimer": gpu is not None,
        "medians": {
            "startupMs": 850, "initialDrawCalls": 280,
            "allocatedTextures": 22, "allocatedGeometries": 40,
            "cpuP95Ms": 9.0, "rafGapP95Ms": 16.7, "gpuMs": gpu,
        },
        "visits": visits,
    }


class HomeGpuCompareTests(unittest.TestCase):
    def setUp(self):
        self.before = report("0123456789abcdef", 4.0)
        self.after = report("abcdef0123456789", 3.6)

    def rejected(self, message, before=None, after=None):
        with self.assertRaisesRegex(IncomparableBenchmarks, message):
            compare_reports(before or self.before, after or self.after)

    def test_real_matching_gpu_results_only(self):
        result = compare_reports(self.before, self.after)
        metric = next(item for item in result["metrics"] if item["key"] == "gpuMs")
        self.assertAlmostEqual(metric["delta"], -0.4)
        self.assertAlmostEqual(metric["percent"], -10)
        self.assertTrue(result["gpuTimingAvailable"])
        text = format_comparison(result)
        self.assertIn("GPU elapsed per draw", text)
        self.assertIn("-10.00%", text)
        self.assertIn("not proof", text)

    def test_missing_gpu_timer_does_not_get_replaced_by_cpu_data(self):
        before = report("0123456789abcdef", gpu=None)
        after = report("abcdef0123456789", gpu=None)
        result = compare_reports(before, after)
        self.assertFalse(result["gpuTimingAvailable"])
        self.assertIn("GPU timing: UNAVAILABLE", format_comparison(result))
        self.assertIn("n/a", format_comparison(result))

    def test_only_one_side_has_gpu_timer(self):
        before = report("0123456789abcdef", gpu=None)
        before["requireTimer"] = False
        self.after["requireTimer"] = False
        result = compare_reports(before, self.after)
        self.assertFalse(result["gpuTimingAvailable"])

    def test_missing_required_gpu_timing_is_rejected(self):
        self.before["medians"]["gpuMs"] = None
        self.rejected("required physical GPU samples")

    def test_disallowed_comparisons_fail_closed(self):
        cases = [
            ("different browser", lambda x: x.update(browserVersion="155.0")),
            ("different viewport", lambda x: x["viewport"].update(width=1920)),
            ("different DPR", lambda x: x["viewport"].update(dpr=2)),
            ("different renderer", lambda x: x["visits"][0].update(rendererFingerprint="baadf00d")),
            ("different vendor", lambda x: [v.update(vendor="intel") for v in x["visits"]]),
            ("different lighting", lambda x: [v.update(ambient="dusk") for v in x["visits"]]),
            ("different LOD", lambda x: [v.update(lod="lite") for v in x["visits"]]),
            ("different framebuffer", lambda x: [v.update(canvasWidth=1080) for v in x["visits"]]),
            ("different timer requirement", lambda x: x.update(requireTimer=False)),
        ]
        for label, mutate in cases:
            with self.subTest(label=label):
                after = copy.deepcopy(self.after)
                mutate(after)
                self.rejected("differs|inconsistent", after=after)

    def test_rejects_stale_schema_same_sha_and_software(self):
        before = copy.deepcopy(self.before)
        before["schema"] = 1
        self.rejected("schema 2", before=before)
        after = copy.deepcopy(self.after)
        after["revision"] = self.before["revision"]
        self.rejected("Same revision", after=after)
        after = copy.deepcopy(self.after)
        after["visits"][2]["actual"] = "software"
        self.rejected("software renderer", after=after)
        after = copy.deepcopy(self.after)
        after["mode"] = "software"
        self.rejected("real hardware", after=after)

    def test_rejects_missing_or_fake_evidence(self):
        changes = [
            ("visit", lambda r: r["visits"].pop()),
            ("canvas", lambda r: r["visits"][0].update(initialTriangles=0)),
            ("GLB", lambda r: r["visits"][0].update(modelRequests=0)),
            ("fingerprint", lambda r: r["visits"][1].update(rendererFingerprint=None)),
            ("revision", lambda r: r.update(revision="dirty")),
            ("not-a-number", lambda r: r["medians"].update(cpuP95Ms=float("nan"))),
        ]
        for label, mutate in changes:
            with self.subTest(label=label):
                after = copy.deepcopy(self.after)
                mutate(after)
                self.rejected("visits|canvas|GLB|fingerprint|SHA|invalid|ready", after=after)

    def test_zero_baseline_never_invents_percentage(self):
        self.before["medians"]["allocatedGeometries"] = 0
        result = compare_reports(self.before, self.after)
        count = next(m for m in result["metrics"] if m["key"] == "allocatedGeometries")
        self.assertIsNone(count["percent"])
        self.assertIn("n/a", format_comparison(result))

    def test_sustained_real_draw_counts_show_up_in_ab(self):
        self.before["medians"].update(
            mainDrawCalls=310, shadowDrawCalls=0,
            mainCastleDrawCalls=265, mainMatthiasDrawCalls=30, mainRuntimeDrawCalls=15,
            shadowCastleDrawCalls=0, shadowMatthiasDrawCalls=0, shadowRuntimeDrawCalls=0,
            firstFrameMainDrawCalls=320, firstFrameShadowDrawCalls=0,
        )
        self.after["medians"].update(
            mainDrawCalls=290, shadowDrawCalls=0,
            mainCastleDrawCalls=245, mainMatthiasDrawCalls=30, mainRuntimeDrawCalls=15,
            shadowCastleDrawCalls=0, shadowMatthiasDrawCalls=0, shadowRuntimeDrawCalls=0,
            firstFrameMainDrawCalls=310, firstFrameShadowDrawCalls=0,
        )
        result = compare_reports(self.before, self.after)
        real = next(m for m in result["metrics"] if m["key"] == "mainDrawCalls")
        castle = next(m for m in result["metrics"] if m["key"] == "mainCastleDrawCalls")
        shadows = next(m for m in result["metrics"] if m["key"] == "shadowDrawCalls")
        self.assertEqual((real["before"], real["after"], real["delta"]), (310, 290, -20))
        self.assertEqual(castle["delta"], -20)
        self.assertEqual((shadows["before"], shadows["after"], shadows["percent"]), (0, 0, None))
        self.assertIn("Sustained main draws", format_comparison(result))
        self.assertIn("measured renderer submissions", format_comparison(result))

    def test_legacy_reports_do_not_invent_sustained_draw_savings(self):
        comparison = compare_reports(self.before, self.after)
        for key in ("mainDrawCalls", "shadowDrawCalls", "mainCastleDrawCalls",
                    "firstFrameMainDrawCalls", "shadowRuntimeDrawCalls"):
            metric = next(m for m in comparison["metrics"] if m["key"] == key)
            self.assertIsNone(metric["before"])
            self.assertIsNone(metric["after"])
            self.assertIsNone(metric["delta"])
        self.assertIn("n/a", format_comparison(comparison))

    def test_invalid_sustained_draw_count_is_rejected(self):
        for value in (-1, float("nan"), float("inf"), "12", True):
            after = copy.deepcopy(self.after)
            after["medians"]["mainDrawCalls"] = value
            self.rejected("invalid mainDrawCalls median", after=after)

    def test_scene_identity_same_station_and_shadows_remains_comparable(self):
        for report_data in (self.before, self.after):
            for visit in report_data["visits"]:
                visit.update(matthiasStation="table-coffee", shadows="enabled")
        result = compare_reports(self.before, self.after)
        self.assertTrue(result["gpuTimingAvailable"])

    def test_matthias_station_changed_between_revisions_is_rejected(self):
        for visit in self.before["visits"]:
            visit.update(matthiasStation="table-coffee", shadows="enabled")
        for visit in self.after["visits"]:
            visit.update(matthiasStation="chess-chair", shadows="enabled")
        self.rejected("scene identity differs")

    def test_shadows_and_visit_station_drift_are_rejected(self):
        for report_data in (self.before, self.after):
            for visit in report_data["visits"]:
                visit.update(matthiasStation="table-coffee", shadows="enabled")
        changed = copy.deepcopy(self.after)
        for visit in changed["visits"]:
            visit["shadows"] = "disabled"
        self.rejected("scene identity differs", after=changed)
        drifted = copy.deepcopy(self.after)
        drifted["visits"][1]["matthiasStation"] = "reading-chair"
        self.rejected("inconsistent", after=drifted)

    def test_missing_one_scene_field_or_invalid_identity_is_rejected(self):
        for visit in self.before["visits"]:
            visit["matthiasStation"] = "table-coffee"
        self.rejected("scene identity differs")
        for visit in self.after["visits"]:
            visit["matthiasStation"] = "table-coffee"
        bad = copy.deepcopy(self.after)
        bad["visits"][0]["matthiasStation"] = ""
        self.rejected("invalid matthiasStation", after=bad)
        bad["visits"][0]["matthiasStation"] = False
        self.rejected("invalid matthiasStation", after=bad)
        # Historical schema-2 captures without these optional keys still work.
        self.assertEqual(
            compare_reports(report("0123456789abcdef"), report("abcdef0123456789"))["lod"],
            "full",
        )

    def test_optional_glb_draw_inventory_is_labeled_as_candidates(self):
        self.before["medians"].update(modelDrawSlots=140, modelShadowCasterSlots=100,
                                      modelTransparentSlots=18, modelUniqueGeometries=80,
                                      modelUniqueMaterials=46)
        self.after["medians"].update(modelDrawSlots=125, modelShadowCasterSlots=93,
                                     modelTransparentSlots=17, modelUniqueGeometries=75,
                                     modelUniqueMaterials=43)
        result = compare_reports(self.before, self.after)
        slots = next(m for m in result["metrics"] if m["key"] == "modelDrawSlots")
        self.assertEqual(slots["delta"], -15)
        output = format_comparison(result)
        self.assertIn("GLB candidate draw slots", output)
        self.assertIn("NOT measured GPU draw calls", output)
        # Older schema-2 benchmark reports can still be compared; their
        # missing optional inventory is labeled n/a, never counted as zero.
        legacy = compare_reports(report("0123456789abcdef"), report("abcdef0123456789", 3.6))
        legacy_slots = next(m for m in legacy["metrics"] if m["key"] == "modelDrawSlots")
        self.assertIsNone(legacy_slots["delta"])

    def test_rejects_fabricated_glb_inventory_metric(self):
        self.after["medians"]["modelDrawSlots"] = float("nan")
        self.rejected("invalid modelDrawSlots median")
        self.after["medians"]["modelDrawSlots"] = -1
        self.rejected("invalid modelDrawSlots median")

    def _attach_live_flames(self, record, *, slots=73, transparent=73, single=0):
        evidence = {
            "flameNodes": 29, "hotNodes": 19, "candleNodes": 25,
            "materialSlots": slots, "doubleSided": slots, "frontSided": 0,
            "otherSided": 0, "transparentNow": transparent,
            "transparentDoubleSidedNow": transparent,
            "singlePassTransparentDoubleSidedNow": single,
        }
        for visit in record["visits"]:
            visit["flamePassLiveEligibility"] = dict(evidence)

    def test_live_flame_population_matches_while_single_pass_changes(self):
        self._attach_live_flames(self.before, single=0)
        self._attach_live_flames(self.after, single=73)
        result = compare_reports(self.before, self.after)
        self.assertTrue(result["flameEvidenceComplete"])
        self.assertIn("Live flame population matches", format_comparison(result))

    def test_missing_live_flame_census_stays_unknown_not_zero(self):
        self._attach_live_flames(self.after)
        result = compare_reports(self.before, self.after)
        self.assertFalse(result["flameEvidenceComplete"])
        self.assertIn("UNAVAILABLE", format_comparison(result))
        old = compare_reports(report("0123456789abcdef"), report("abcdef0123456789"))
        self.assertFalse(old["flameEvidenceComplete"])

    def test_rejects_partially_missing_or_drifting_live_flame_counts(self):
        self._attach_live_flames(self.before)
        self._attach_live_flames(self.after)
        missing = copy.deepcopy(self.before)
        missing["visits"][1]["flamePassLiveEligibility"] = None
        self.rejected("missing from some visits", before=missing)
        drift = copy.deepcopy(self.before)
        drift["visits"][2]["flamePassLiveEligibility"]["transparentNow"] = 72
        drift["visits"][2]["flamePassLiveEligibility"]["transparentDoubleSidedNow"] = 72
        self.rejected("population drifted", before=drift)
        mismatch = copy.deepcopy(self.after)
        for visit in mismatch["visits"]:
            visit["flamePassLiveEligibility"]["flameNodes"] = 28
        self.rejected("population differs", after=mismatch)

    def test_rejects_corrupt_live_material_sidedness_or_forged_zero(self):
        self._attach_live_flames(self.before)
        self._attach_live_flames(self.after)
        for mutate in (
            lambda e: e.update(doubleSided=72),
            lambda e: e.update(transparentNow=74),
            lambda e: e.update(singlePassTransparentDoubleSidedNow=74),
            lambda e: e.update(flameNodes=True),
        ):
            invalid = copy.deepcopy(self.after)
            mutate(invalid["visits"][0]["flamePassLiveEligibility"])
            self.rejected("invalid|inconsistent", after=invalid)

    def test_dawn_and_dusk_are_legitimate_if_identical(self):
        for data in (self.before, self.after):
            for visit in data["visits"]:
                visit["ambient"] = "dawn"
        self.assertEqual(compare_reports(self.before, self.after)["ambient"], "dawn")


if __name__ == "__main__":
    unittest.main()
