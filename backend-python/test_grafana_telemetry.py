import grafana_telemetry as telemetry


class _Counter:
    def __init__(self):
        self.calls = []

    def add(self, value, attributes):
        self.calls.append((value, attributes))


class _Histogram:
    def __init__(self):
        self.calls = []

    def record(self, value, attributes):
        self.calls.append((value, attributes))


class _OtlpLogger:
    def __init__(self):
        self.calls = []

    def emit(self, **kwargs):
        self.calls.append(kwargs)


def setup_function():
    telemetry._state = {"enabled": False, "reason": "not_configured"}
    telemetry._http_requests = None
    telemetry._http_duration = None
    telemetry._ai_requests = None
    telemetry._ai_duration = None
    telemetry._online_users_gauge = None
    telemetry._online_users = 0
    telemetry._logger_provider = None
    telemetry._otlp_logger = None


def test_stays_disabled_without_render_credentials(monkeypatch):
    monkeypatch.delenv("GRAFANA_OTLP_ENDPOINT", raising=False)
    monkeypatch.delenv("GRAFANA_OTLP_HEADERS", raising=False)
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_ENDPOINT", raising=False)
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_HEADERS", raising=False)
    monkeypatch.delenv("GRAFANA_OTLP_INSTANCE_ID", raising=False)
    monkeypatch.delenv("GRAFANA_OTLP_TOKEN", raising=False)

    assert telemetry.configure(service_name="chess-studio-api", service_version="test", environment="test") is False
    assert telemetry.status() == {"enabled": False, "reason": "not_configured"}


def test_accepts_the_encoded_header_copied_from_grafana_portal():
    assert telemetry._headers_from_portal("Authorization=Basic%20ZXhhbXBsZTpwYXNz") == {
        "Authorization": "Basic ZXhhbXBsZTpwYXNz",
    }


def test_accepts_a_basic_header_value_without_the_authorization_key():
    assert telemetry._headers_from_portal("Basic%20ZXhhbXBsZTpwYXNz") == {
        "Authorization": "Basic ZXhhbXBsZTpwYXNz",
    }


def test_prefers_grafana_standard_environment_variable_names(monkeypatch):
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "https://otlp.example.net/otlp")
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_HEADERS", "Authorization=Basic%20ZXhhbXBsZTpwYXNz")

    endpoint, headers, uses_standard_environment = telemetry._configuration()
    assert endpoint == "https://otlp.example.net/otlp"
    assert headers == {"Authorization": "Basic ZXhhbXBsZTpwYXNz"}
    assert uses_standard_environment is True


def test_http_metrics_are_bounded_and_do_not_include_client_release():
    counter = _Counter()
    histogram = _Histogram()
    telemetry._state = {"enabled": True, "reason": "configured"}
    telemetry._http_requests = counter
    telemetry._http_duration = histogram

    telemetry.record_http_request("get", "/api/games/{game_id}", 503, 0.42)

    expected = {
        "http.request.method": "GET",
        "http.route": "/api/games/{game_id}",
        "http.response.status_class": "5xx",
    }
    assert counter.calls == [(1, expected)]
    assert histogram.calls == [(0.42, expected)]
    assert "release" not in str(expected).lower()
    assert "username" not in str(expected).lower()


def test_ai_metrics_use_only_provider_and_bounded_channel():
    counter = _Counter()
    histogram = _Histogram()
    telemetry._state = {"enabled": True, "reason": "configured"}
    telemetry._ai_requests = counter
    telemetry._ai_duration = histogram

    telemetry.record_ai_request("cloudflare", "combat", 0.8)

    assert counter.calls == [(1, {"ai.provider": "cloudflare", "ai.channel": "combat"})]
    assert histogram.calls == [(0.8, {"ai.provider": "cloudflare", "ai.channel": "combat"})]


def test_online_users_is_aggregated_and_bounded():
    telemetry.record_online_users(7)
    assert telemetry._online_users == 7

    telemetry.record_online_users(-8)
    assert telemetry._online_users == 0

    telemetry.record_online_users(9_999_999)
    assert telemetry._online_users == 1_000_000

    telemetry.record_online_users("not-a-number")
    assert telemetry._online_users == 0


def test_loki_http_log_is_safe_and_contains_only_operational_fields():
    otlp_logger = _OtlpLogger()
    telemetry._state = {"enabled": True, "reason": "configured"}
    telemetry._otlp_logger = otlp_logger

    telemetry.record_http_log(
        request_id="req-123",
        method="post",
        route="/api/narrative",
        status_code=503,
        duration_ms=1234.56,
        client_release="v16.6dm46t",
    )

    assert otlp_logger.calls == [{
        "severity_text": "ERROR",
        "body": "http_request",
        "attributes": {
            "event.name": "http_request",
            "request.id": "req-123",
            "http.request.method": "POST",
            "http.route": "/api/narrative",
            "http.response.status_code": 503,
            "http.response.status_class": "5xx",
            "http.server.duration_ms": 1234.56,
            "client.release": "v16.6dm46t",
        },
    }]
    assert "username" not in str(otlp_logger.calls).lower()
