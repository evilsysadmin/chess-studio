import importlib.util
from pathlib import Path

import chess
import pytest


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "cpu_strength_calibration.py"
SPEC = importlib.util.spec_from_file_location("cpu_strength_calibration", MODULE_PATH)
calibration = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
import sys
sys.modules[SPEC.name] = calibration
SPEC.loader.exec_module(calibration)


def test_rating_estimate_is_centered_and_monotonic():
    assert calibration.estimate_rating(1400, 5, 0, 5) == 1400
    assert calibration.estimate_rating(1400, 7, 0, 3) > 1400
    assert calibration.estimate_rating(1400, 3, 0, 7) < 1400


def test_opening_lines_are_legal_and_leave_both_colors_to_move_across_suite():
    for line in calibration.OPENINGS:
        board = chess.Board()
        calibration.apply_opening(board, line)
        assert len(board.move_stack) == len(line)


def test_reference_contract_requires_explicit_uci_elo_support():
    class FakeEngine:
        options = {}

    with pytest.raises(RuntimeError, match="UCI_LimitStrength"):
        calibration.configure_reference_engine(FakeEngine(), 1400)


def test_reference_contract_rejects_out_of_range_elo():
    class Option:
        min = 1320
        max = 2800

    class FakeEngine:
        options = {
            "UCI_LimitStrength": object(),
            "UCI_Elo": Option(),
        }

        def configure(self, _config):
            raise AssertionError("invalid Elo must fail before configure")

    with pytest.raises(ValueError, match="below engine minimum"):
        calibration.configure_reference_engine(FakeEngine(), 1200)


def test_report_requires_a_real_two_color_sample(monkeypatch):
    monkeypatch.setattr(
        calibration.chess.engine.SimpleEngine,
        "popen_uci",
        lambda _path: (_ for _ in ()).throw(AssertionError("validation should run first")),
    )
    with pytest.raises(ValueError, match="at least 2 games"):
        calibration.calibration_report(
            "/fake/engine",
            levels=[45],
            reference_elos=[1400],
            games=1,
            move_time_s=0.1,
            max_plies=200,
            seed=1,
        )
