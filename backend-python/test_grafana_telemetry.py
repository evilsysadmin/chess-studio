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


def setup_function():
    telemetry._state = {"enabled": False, "reason": "not_configured"}
    telemetry._http_requests = None
    telemetry._http_duration = None
    telemetry._ai_requests = None
    telemetry._ai_duration = None


def test_stays_disabled_without_render_credentials(monkeypatch):
    monkeypatch.delenv("GRAFANA_OTLP_ENDPOINT", raising=False)
    monkeypatch.delenv("GRAFANA_OTLP_HEADERS", raising=False)
    monkeypatch.delenv("GRAFANA_OTLP_INSTANCE_ID", raising=False)
    monkeypatch.delenv("GRAFANA_OTLP_TOKEN", raising=False)

    assert telemetry.configure(service_name="chess-studio-api", service_version="test", environment="test") is False
    assert telemetry.status() == {"enabled": False, "reason": "not_configured"}


def test_accepts_the_encoded_header_copied_from_grafana_portal():
    assert telemetry._headers_from_portal("Authorization=Basic%20ZXhhbXBsZTpwYXNz") == {
        "Authorization": "Basic ZXhhbXBsZTpwYXNz",
    }


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
