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
    monkeypatch.setattr(tracing, "_TRACE_PROVIDER", None)
    result = tracing.emit_trace_probe()
    assert result["ok"] is False
    assert result["reason"] == "tracing_not_configured"


def test_generic_otlp_endpoint_enables_all_three_signals():
    cfg = tracing_settings({"OTEL_EXPORTER_OTLP_ENDPOINT": "https://otlp.example/otlp"})
    assert cfg["traces_enabled"] is True
    assert cfg["metrics_enabled"] is True
    assert cfg["logs_enabled"] is True
    assert cfg["generic_endpoint_configured"] is True


def test_signal_diagnostics_never_expose_endpoints_or_headers(monkeypatch):
    import tracing
    monkeypatch.setattr(tracing, "_TRACE_PROVIDER", object())
    monkeypatch.setattr(tracing, "_METER_PROVIDER", object())
    monkeypatch.setattr(tracing, "_LOGGER_PROVIDER", object())
    d = tracing.tracing_diagnostics({
        "OTEL_EXPORTER_OTLP_ENDPOINT": "https://super-secret.example/otlp",
        "OTEL_EXPORTER_OTLP_HEADERS": "Authorization=Basic no-me-mires",
    })
    assert all(d["signals"][name]["configured"] for name in ("traces", "metrics", "logs"))
    assert "super-secret" not in str(d)
    assert "no-me-mires" not in str(d)


def test_tracing_defaults_to_otlp_http_protobuf_protocol():
    cfg = tracing_settings({"OTEL_EXPORTER_OTLP_ENDPOINT": "https://otlp.example/otlp"})
    assert cfg["protocol"] == "http/protobuf"


def test_tracing_respects_explicit_otlp_protocol():
    cfg = tracing_settings({
        "OTEL_EXPORTER_OTLP_ENDPOINT": "https://otlp.example/otlp",
        "OTEL_EXPORTER_OTLP_PROTOCOL": "HTTP/PROTOBUF",
    })
    assert cfg["protocol"] == "http/protobuf"


def test_explicit_enable_without_endpoint_stays_disabled():
    cfg = tracing_settings({"OTEL_TRACES_ENABLED": "true"})
    assert cfg["enabled"] is False
    assert cfg["traces_enabled"] is False


def test_trace_export_error_reports_safe_http_status():
    import tracing
    assert tracing._trace_export_error(401, "FAILURE") == "http_401"
    assert tracing._trace_export_error(404, "FAILURE") == "http_404"
    assert tracing._trace_export_error(None, "FAILURE") == "export_failed"
    assert tracing._trace_export_error(200, "SUCCESS") is None


def test_trace_export_diagnostics_exposes_counts_not_secrets(monkeypatch):
    import tracing
    monkeypatch.setattr(tracing, "_TRACE_EXPORT_STATE", {
        "attemptCount": 3, "successCount": 2, "failureCount": 1,
        "exportedSpanCount": 9, "lastResult": "FAILURE",
        "lastError": "http_401", "lastHttpStatus": 401,
    })
    diagnostics = tracing.tracing_diagnostics({"OTEL_EXPORTER_OTLP_ENDPOINT": "https://secret.example/otlp"})
    assert diagnostics["traceExporter"]["successCount"] == 2
    assert diagnostics["traceExporter"]["lastHttpStatus"] == 401
    assert "secret.example" not in str(diagnostics)
