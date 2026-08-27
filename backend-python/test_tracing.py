from tracing import tracing_settings


def test_tracing_auto_enables_only_with_otlp_endpoint():
    assert tracing_settings({})["enabled"] is False
    cfg = tracing_settings({"OTEL_EXPORTER_OTLP_ENDPOINT": "https://tempo.example/otlp"})
    assert cfg["enabled"] is True
    assert cfg["service_name"] == "chess-studio-backend"


def test_tracing_can_be_explicitly_disabled_even_with_endpoint():
    cfg = tracing_settings({
        "OTEL_EXPORTER_OTLP_ENDPOINT": "https://tempo.example/otlp",
        "OTEL_TRACES_ENABLED": "false",
    })
    assert cfg["enabled"] is False


def test_specific_trace_endpoint_wins_over_generic_endpoint():
    cfg = tracing_settings({
        "OTEL_EXPORTER_OTLP_ENDPOINT": "https://generic.example/otlp",
        "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT": "https://tempo.example/v1/traces",
        "OTEL_SERVICE_NAME": "chess-studio-prod",
    })
    assert cfg["endpoint"] == "https://tempo.example/v1/traces"
    assert cfg["service_name"] == "chess-studio-prod"
