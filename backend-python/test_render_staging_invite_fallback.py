from __future__ import annotations

import importlib.util
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "render_staging_bootstrap.py"
SPEC = importlib.util.spec_from_file_location("render_staging_bootstrap_invite_test", SCRIPT)
render = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(render)


def test_missing_staging_invite_falls_back_to_production_source() -> None:
    values = {
        ("srv-stage", "INVITE_CODE"): None,
        ("srv-prod", "INVITE_CODE"): "invite-human",
    }

    with (
        patch.object(render, "_read_env_direct", side_effect=lambda service, key: values.get((service, key))),
        patch.object(render, "find_service", return_value={"id": "srv-stage"}),
        patch.object(render, "find_production_service", return_value={"id": "srv-prod"}),
    ):
        assert render.read_env("srv-stage", "INVITE_CODE") == "invite-human"


def test_invite_fallback_never_leaks_to_an_unrelated_service() -> None:
    with (
        patch.object(render, "_read_env_direct", return_value=None),
        patch.object(render, "find_service", return_value={"id": "srv-stage"}),
        patch.object(render, "find_production_service") as find_production,
    ):
        assert render.read_env("srv-other", "INVITE_CODE") is None

    find_production.assert_not_called()
