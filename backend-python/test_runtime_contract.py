from runtime_contract import (
    RUNTIME_SCHEMA_KEY,
    RUNTIME_SCHEMA_VERSION,
    staging_runtime_contract_ready,
)


def test_runtime_contract_only_blocks_staging_without_current_schema():
    assert staging_runtime_contract_ready({}) is True
    assert staging_runtime_contract_ready({"ENVIRONMENT": "production"}) is True
    assert staging_runtime_contract_ready({"ENVIRONMENT": "staging"}) is False
    assert staging_runtime_contract_ready({
        "ENVIRONMENT": "staging",
        RUNTIME_SCHEMA_KEY: "render-legacy",
    }) is False
    assert staging_runtime_contract_ready({
        "ENVIRONMENT": "staging",
        RUNTIME_SCHEMA_KEY: RUNTIME_SCHEMA_VERSION,
    }) is True
