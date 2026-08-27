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


def test_tracing_diagnostics_exposes_state_but_never_endpoint_or_headers(monkeypatch):
    import tracing

    monkeypatch.setattr(tracing, "_CONFIGURED", False)
    monkeypatch.setattr(tracing, "_LAST_INIT_ERROR", "ExporterBoom")
    diagnostics = tracing.tracing_diagnostics({
        "OTEL_EXPORTER_OTLP_ENDPOINT": "https://secret-tempo.example/otlp",
        "OTEL_EXPORTER_OTLP_HEADERS": "Authorization=Basic ultra-secret",
        "OTEL_SERVICE_NAME": "chess-prod",
    })
    assert diagnostics["enabled"] is True
    assert diagnostics["endpointConfigured"] is True
    assert diagnostics["headersConfigured"] is True
    assert diagnostics["serviceName"] == "chess-prod"
    assert diagnostics["initializationError"] == "ExporterBoom"
    serialized = str(diagnostics)
    assert "secret-tempo" not in serialized
    assert "ultra-secret" not in serialized


def test_trace_probe_fails_open_when_tracing_is_not_initialized(monkeypatch):
    import tracing

    monkeypatch.setattr(tracing, "_CONFIGURED", False)
    monkeypatch.setattr(tracing, "_PROVIDER", None)
    result = tracing.emit_trace_probe()
    assert result["ok"] is False
    assert result["reason"] == "tracing_not_configured"
