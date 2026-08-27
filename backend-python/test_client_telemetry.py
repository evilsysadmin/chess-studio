import client_telemetry as telemetry


def setup_function():
    telemetry.reset_client_telemetry()


def test_frontend_telemetry_keeps_only_bounded_coarse_signals():
    assert telemetry.record_client_event({"eventType": "frontend_error", "errorName": "TypeError", "context": "Home", "release": "v1"}, username="alice")
    assert telemetry.record_client_event({"eventType": "web_vital", "metricName": "LCP", "value": 1234.5, "context": "Home", "release": "v1"})
    summary = telemetry.get_client_telemetry()
    assert summary["samples"] == 2
    assert summary["errors"] == 1
    assert summary["error_names"] == {"TypeError": 1}
    assert summary["vitals_p75"]["LCP"] == 1234.5
    assert "alice" not in str(summary)


def test_frontend_telemetry_rejects_free_form_or_unknown_metrics():
    assert telemetry.record_client_event({"eventType": "chat_message", "value": 1}) is False
    assert telemetry.record_client_event({"eventType": "web_vital", "metricName": "SECRET", "value": 1}) is False
    assert telemetry.get_client_telemetry()["samples"] == 0
