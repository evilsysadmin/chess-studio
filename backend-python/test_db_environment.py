import pytest

import db


def test_staging_rejects_production_database_name():
    with pytest.raises(RuntimeError, match="no puede usar la base Mongo de producción"):
        db.validate_storage_namespace("staging", "chess_study")


def test_preview_rejects_production_database_name():
    with pytest.raises(RuntimeError, match="no puede usar la base Mongo de producción"):
        db.validate_storage_namespace("preview", "chess_study")


def test_staging_accepts_isolated_database_name():
    db.validate_storage_namespace("staging", "chess_study_staging")


def test_production_accepts_production_database_name():
    db.validate_storage_namespace("production", "chess_study")
