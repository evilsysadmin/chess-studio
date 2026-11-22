#!/usr/bin/env python3
"""Report how much public PvP traffic still reaches the Python backend.

Every public /api/pvp route has a native Go handler behind the pvp-edge. A
request that FastAPI still records under an /api/pvp route therefore went
through the Python compatibility fallback (a kill-switch was off, or the edge
proxied it). That includes the internal resident move oracle: Go chooses
resident moves natively and only calls it when PVP_NATIVE_RESIDENT_MOVE_ENABLED
is off.

This is the evidence gate for retiring the Python fallback: the report reads
`chess_studio_http_server_requests_total` from Grafana (the same read-only API
as scripts/grafana_live_check.py) and lists fallback requests per environment
and route over the window. With --max-requests it fails when the total is
above the allowed budget.

Standard-library only.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request
import urllib.error

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from grafana_live_check import GrafanaReadApi, _resolve_datasource_uid, fail  # noqa: E402

SERVICES = {
    "chess-studio-backend": "production",
    "chess-studio-backend-staging": "staging",
}

# The current OCI runtime has no Python container. The Go-only service must
# independently prove that it is serving all routes, and Grafana must contain
# recent native Go request counters. Absence of Python metrics alone is not zero.
NATIVE_SERVICES = {
    "chess-studio-backend-go": "production",
    "chess-studio-backend-staging-go": "staging",
}
NATIVE_READY = {
    "production": "https://api.chess-studio.shadowops.dpdns.org/api/pvp/_edge/ready",
    "staging": "https://api-staging.chess-studio.shadowops.dpdns.org/api/pvp/_edge/ready",
}


def verify_native_ready_payload(payload: dict, environment: str) -> None:
    native = {k: v for k, v in payload.items() if k.startswith("native")}
    release = str(payload.get("release") or "")
    if not (
        payload.get("status") == "ready"
        and payload.get("service") == "chess-studio-pvp-go"
        and payload.get("runtimeService") == "chess-studio-backend-go"
        and payload.get("pythonRetired") is True
        and len(native) >= 30
        and all(value is True for value in native.values())
        and len(release) == 40
        and all(ch in "0123456789abcdef" for ch in release.lower())
    ):
        fail(f"cannot attest zero PvP fallback: {environment} is not fully Go-only")


def verify_native_runtime(
    fetcher=None,
) -> None:
    """Independent, live Go-only proof; do not infer deployment from Git config."""
    if fetcher is None:
        def fetcher(url: str) -> dict:
            # Match the established public staging verifier's cache-busting
            # headers so Cloudflare does not serve a stale or blocked probe.
            request = urllib.request.Request(
                url + f"?probe={time.time_ns()}",
                headers={
                    "Accept": "application/json",
                    "Cache-Control": "no-cache, no-store",
                    "Pragma": "no-cache",
                    "User-Agent": "chess-studio-staging-deploy/6",
                },
            )
            try:
                with urllib.request.urlopen(request, timeout=8) as response:
                    if response.status != 200:
                        fail(f"cannot attest zero PvP fallback: Go readiness HTTP {response.status}")
                    raw = response.read(65537)
                if len(raw) > 65536:
                    fail("cannot attest zero PvP fallback: oversized Go readiness response")
                result = json.loads(raw)
                if not isinstance(result, dict):
                    fail("cannot attest zero PvP fallback: invalid Go readiness payload")
                return result
            except urllib.error.HTTPError as exc:
                fail(f"cannot attest zero PvP fallback: Go readiness HTTP {exc.code} at {url}")
            except (urllib.error.URLError, TimeoutError, ValueError) as exc:
                fail(f"cannot attest zero PvP fallback: Go readiness unavailable: {type(exc).__name__}")
    for environment, url in NATIVE_READY.items():
        verify_native_ready_payload(fetcher(url), environment)



def _window_seconds(raw: str) -> int:
    text = str(raw or "").strip().lower()
    units = {"h": 3600, "d": 86400}
    if not text or text[-1] not in units or not text[:-1].isdigit():
        fail("window must look like 24h or 14d")
    seconds = int(text[:-1]) * units[text[-1]]
    if seconds < 3600 or seconds > 31 * 86400:
        fail("window must be between 1h and 31d")
    return seconds


def fallback_query(window_seconds: int) -> str:
    services = "|".join(sorted(SERVICES))
    selector = f'service_name=~"{services}",http_route=~"/api/pvp.*"'
    return (
        "sum by (service_name, http_route, http_response_status_class) "
        f"(increase(chess_studio_http_server_requests_total{{{selector}}}[{window_seconds}s]))"
    )


def telemetry_coverage_query(window_seconds: int) -> str:
    """Require positive recent Go request counters from production and staging.

    The Python exporter was retired with its container: its heartbeat cannot
    attest the currently deployed Go-only runtime.
    """
    services = "|".join(sorted(NATIVE_SERVICES))
    lookback = min(window_seconds, 86400)
    return (
        "sum by (service_name) (count_over_time("
        f'chess_studio_http_server_requests_total{{service_name=~"{services}"}}[{lookback}s]))'
    )


def verify_telemetry_coverage(payload: dict) -> None:
    data = payload.get("data") if isinstance(payload, dict) else None
    result = data.get("result") if isinstance(data, dict) else None
    if not isinstance(result, list):
        fail("cannot attest zero PvP fallback: invalid native Go telemetry response")
    seen = set()
    for item in result:
        metric = item.get("metric") if isinstance(item, dict) else None
        value = item.get("value") if isinstance(item, dict) else None
        service = metric.get("service_name") if isinstance(metric, dict) else None
        if service not in NATIVE_SERVICES or not isinstance(value, list) or len(value) != 2:
            fail("cannot attest zero PvP fallback: malformed native Go metric series")
        try:
            samples = float(value[1])
        except (TypeError, ValueError):
            fail("cannot attest zero PvP fallback: invalid native Go metric count")
        if not math.isfinite(samples) or samples <= 0:
            fail("cannot attest zero PvP fallback: no recent native Go samples")
        seen.add(service)
    missing = sorted(set(NATIVE_SERVICES) - seen)
    if missing:
        fail("cannot attest zero PvP fallback: no native Go metrics in 24h for " + ", ".join(missing))


def coverage_diagnostic_queries() -> tuple[str, ...]:
    """Read-only diagnostics: native evidence, then legacy Python series."""
    services = "|".join(sorted(NATIVE_SERVICES))
    return (
        f'count by (service_name) (chess_studio_http_server_requests_total{{service_name=~"{services}"}})',
        f'count by (service_name) (count_over_time(chess_studio_http_server_requests_total{{service_name=~"{services}"}}[24h]))',
        'count({__name__="chess_studio_http_server_requests_total"})',
        'count({__name__="chess_studio_python_telemetry_heartbeat"})',
    )


def diagnose_missing_coverage(api: GrafanaReadApi, metrics_uid: str) -> None:
    """Emit aggregate series counts only, never raw labels or secret endpoints."""
    for index, query in enumerate(coverage_diagnostic_queries(), start=1):
        try:
            payload, metrics_uid = query_with_uid_recovery(
                api, metrics_uid, "prometheus", "/api/v1/query",
                {"query": query, "time": str(int(time.time()))},
            )
            result = payload.get("data", {}).get("result", [])
            if not isinstance(result, list):
                raise ValueError("invalid vector")
            counts = {}
            for item in result:
                metric = item.get("metric", {})
                value = item.get("value", [])
                service = metric.get("service_name")
                labels = {**SERVICES, **NATIVE_SERVICES}
                if service not in labels and index not in (3, 4):
                    continue
                if len(value) != 2:
                    continue
                counts[labels[service] if service in labels else "all"] = value[1]
            print(json.dumps({"check": "pvp_metric_diagnostic", "probe": index,
                              "counts": counts}, sort_keys=True))
        except (SystemExit, ValueError, TypeError, AttributeError):
            print(json.dumps({"check": "pvp_metric_diagnostic", "probe": index,
                              "status": "unavailable"}, sort_keys=True), file=sys.stderr)


def parse_rows(payload: dict) -> list[dict]:
    data = payload.get("data") if isinstance(payload, dict) else None
    result = data.get("result") if isinstance(data, dict) else None
    if not isinstance(result, list):
        fail("unexpected Prometheus response shape")
    rows = []
    for item in result:
        metric = item.get("metric") if isinstance(item, dict) else None
        value = item.get("value") if isinstance(item, dict) else None
        if not isinstance(metric, dict) or not isinstance(value, list) or len(value) != 2:
            continue
        try:
            count = float(value[1])
        except (TypeError, ValueError):
            continue
        # increase() extrapolates; anything under half a request is noise.
        if count < 0.5:
            continue
        rows.append({
            "environment": SERVICES.get(str(metric.get("service_name")), str(metric.get("service_name"))),
            "route": str(metric.get("http_route") or "?"),
            "status": str(metric.get("http_response_status_class") or "?"),
            "requests": round(count),
        })
    rows.sort(key=lambda row: (row["environment"], -row["requests"], row["route"]))
    return rows


def markdown(rows: list[dict], window: str) -> str:
    total = sum(row["requests"] for row in rows)
    lines = [f"### PvP · Python fallback usage ({window})", ""]
    if not rows:
        lines.append("No public `/api/pvp` request reached Python in the window. ✅")
        return "\n".join(lines) + "\n"
    lines += [
        f"**{total}** public PvP requests reached the Python fallback.",
        "",
        "| Environment | Route | Status | Requests |",
        "| --- | --- | --- | ---: |",
    ]
    lines += [f"| {r['environment']} | `{r['route']}` | {r['status']} | {r['requests']} |" for r in rows]
    return "\n".join(lines) + "\n"


def timeline_query() -> str:
    services = "|".join(sorted(SERVICES))
    return (
        "sum by (service_name) (increase(chess_studio_http_server_requests_total"
        f'{{service_name=~"{services}",http_route=~"/api/pvp.*"}}[1h]))'
    )


def timeline_rows(payload: dict) -> list[dict]:
    data = payload.get("data") if isinstance(payload, dict) else None
    result = data.get("result") if isinstance(data, dict) else None
    rows = []
    for series in result or []:
        metric = series.get("metric") if isinstance(series, dict) else None
        environment = SERVICES.get(str((metric or {}).get("service_name")), "?")
        for stamp, raw in series.get("values") or []:
            count = round(float(raw))
            if count:
                rows.append({"environment": environment, "hour_end": int(float(stamp)), "requests": count})
    rows.sort(key=lambda row: (row["hour_end"], row["environment"]))
    return rows


def timeline_markdown(rows: list[dict]) -> str:
    lines = ["#### Hourly fallback requests (UTC, hour ending)", ""]
    if not rows:
        return "\n".join(lines + ["None.", ""]) + "\n"
    lines += ["| Hour ending | Environment | Requests |", "| --- | --- | ---: |"]
    lines += [
        f"| {time.strftime('%Y-%m-%d %H:%M', time.gmtime(r['hour_end']))} | {r['environment']} | {r['requests']} |"
        for r in rows
    ]
    return "\n".join(lines) + "\n"


LOG_SERVICES = {"production": "chess-studio-backend", "staging": "chess-studio-backend-staging"}


def breakdown_query(service: str, window_seconds: int) -> str:
    """Who sends the fallback traffic, from Python's structured access logs.

    pvp_hop says how the request reached Python: "go:<reason>" when the Go
    sidecar forwarded it (and why), "direct" when it bypassed the sidecar.
    peer_ip is the hop right before FastAPI on the Docker network;
    synthetic_source marks smoke and capacity traffic. User names and client
    IPs are deliberately left out.
    """
    return (
        "sum by (route, method, pvp_hop, peer_ip, synthetic_source) (count_over_time("
        f'{{service_name="{service}"}} | json | __error__="" | event="http_request" '
        f'| route=~"/api/pvp.*" [{window_seconds}s]))'
    )


def breakdown_rows(payload: dict) -> list[dict]:
    data = payload.get("data") if isinstance(payload, dict) else None
    result = data.get("result") if isinstance(data, dict) else None
    rows = []
    for item in result or []:
        metric = item.get("metric") if isinstance(item, dict) else None
        value = item.get("value") if isinstance(item, dict) else None
        if not isinstance(metric, dict) or not isinstance(value, list) or len(value) != 2:
            continue
        rows.append({
            "route": str(metric.get("route") or "?"),
            "method": str(metric.get("method") or "?"),
            "hop": str(metric.get("pvp_hop") or "?"),
            "peer_ip": str(metric.get("peer_ip") or "-"),
            "synthetic": str(metric.get("synthetic_source") or "-"),
            "requests": round(float(value[1])),
        })
    rows.sort(key=lambda row: (-row["requests"], row["route"]))
    return rows


def breakdown_markdown(environment: str, rows: list[dict]) -> str:
    lines = [f"#### Sources · {environment}", ""]
    if not rows:
        return "\n".join(lines + ["No matching access logs.", ""]) + "\n"
    lines += ["| Route | Method | Via | Peer | Synthetic | Requests |", "| --- | --- | --- | --- | --- | ---: |"]
    lines += [f"| `{r['route']}` | {r['method']} | {r['hop']} | {r['peer_ip']} | {r['synthetic']} | {r['requests']} |" for r in rows[:40]]
    return "\n".join(lines) + "\n"


def resolve_datasource_uids(api: GrafanaReadApi, metrics_uid: str, logs_uid: str, *, include_logs: bool) -> tuple[str, str]:
    """Only use datasource discovery if a required UID was not configured.

    A configured UID can be queried directly. Avoid making a successful
    evidence report depend on Grafana's optional /api/datasources endpoint.
    Actual Prometheus/Loki query failures still fail closed (never fake zero).
    """
    metrics_uid = str(metrics_uid or "").strip()
    logs_uid = str(logs_uid or "").strip() if include_logs else ""
    needs_discovery = not metrics_uid or (include_logs and not logs_uid)
    datasources = api.get_list("/api/datasources") if needs_discovery else None
    if datasources is not None:
        metrics_uid = _resolve_datasource_uid(datasources, metrics_uid, "prometheus")
        if include_logs:
            logs_uid = _resolve_datasource_uid(datasources, logs_uid, "loki")
    if not metrics_uid:
        fail("missing GRAFANA_METRICS_DATASOURCE_UID")
    if include_logs and not logs_uid:
        fail("missing GRAFANA_LOGS_DATASOURCE_UID")
    return metrics_uid, logs_uid



def query_with_uid_recovery(
    api: GrafanaReadApi, uid: str, kind: str, suffix: str,
    params: dict[str, str], *, sleep=time.sleep,
) -> tuple[dict, str]:
    """Recover a stale configured UID after a *specific* Grafana 404.

    No arbitrary 404, bad credential or unavailable metrics may become a
    fabricated zero. Discovery retries cover short-lived Grafana startup 503s.
    """
    def query(candidate: str) -> dict:
        path = f"/api/datasources/proxy/uid/{urllib.parse.quote(candidate, safe='')}{suffix}"
        # Retry only transport/gateway failures. Do not retry auth, stale UID
        # 404, or invalid Prometheus/Loki responses; those must fail closed.
        for attempt in range(3):
            try:
                return api.get_json(path, params)
            except SystemExit as exc:
                prefix = f"grafana-live-check FAIL · GET {path}: HTTP "
                message = str(exc)
                code = message[len(prefix):].split(":", 1)[0] if message.startswith(prefix) else ""
                if code not in {"502", "503", "504", "522", "524"} or attempt == 2:
                    raise
                print(f"Grafana datasource transient HTTP {code}; retry {attempt + 1}/2", file=sys.stderr)
                sleep(attempt + 1)  # at most 3s per query, not a 120s CI stall
        raise AssertionError("unreachable")

    try:
        return query(uid), uid
    except SystemExit as original:
        message = str(original)
        if "HTTP 404" not in message or "Unable to find datasource" not in message:
            raise

    datasources = None
    for attempt in range(3):
        if attempt:
            sleep(attempt)  # bounded: total three seconds maximum
        try:
            datasources = api.get_list("/api/datasources")
            break
        except SystemExit as exc:
            # Grafana Cloud returns 503 while a stack is starting. Retry only
            # this transient condition; auth/permission failures are fatal.
            if "HTTP 503" not in str(exc) or attempt == 2:
                raise
    if datasources is None:
        fail(f"stale {kind} datasource UID and discovery unavailable")
    recovered = _resolve_datasource_uid(datasources, uid, kind)
    if recovered == uid:
        fail(f"stale {kind} datasource UID {uid!r} could not be recovered")
    return query(recovered), recovered


def self_test() -> int:
    query = fallback_query(14 * 86400)
    assert 'http_route=~"/api/pvp.*"' in query
    assert "resident-move" not in query  # the oracle is a fallback too
    assert 'service_name=~"chess-studio-backend|chess-studio-backend-staging"' in query
    assert "[1209600s]" in query
    assert _window_seconds("14d") == 1209600
    payload = {"data": {"result": [
        {"metric": {"service_name": "chess-studio-backend", "http_route": "/api/pvp/lobby",
                    "http_response_status_class": "2xx"}, "value": [0, "3.4"]},
        {"metric": {"service_name": "chess-studio-backend-staging", "http_route": "/api/pvp/roster",
                    "http_response_status_class": "2xx"}, "value": [0, "0.2"]},
    ]}}
    rows = parse_rows(payload)
    assert rows == [{"environment": "production", "route": "/api/pvp/lobby", "status": "2xx", "requests": 3}], rows
    assert "**3** public PvP requests" in markdown(rows, "14d")
    assert "No public" in markdown([], "14d")
    control = telemetry_coverage_query(14 * 86400)
    assert '[86400s]' in control and 'http_route' not in control
    assert 'chess_studio_http_server_requests_total' in control
    assert 'chess_studio_python_telemetry_heartbeat' not in control
    assert '[3600s]' in telemetry_coverage_query(3600)
    assert 'chess-studio-backend-go|chess-studio-backend-staging-go' in control
    probes = coverage_diagnostic_queries()
    assert len(probes) == 4 and "count_over_time" in probes[1]
    assert "chess_studio_http_server_requests_total" in probes[0]
    assert "chess_studio_python_telemetry_heartbeat" in probes[3]
    assert all("api/pvp" not in probe for probe in probes)
    class DiagnosticGrafana:
        def get_json(self, path: str, params: dict[str, str]) -> dict:
            assert "/api/v1/query" in path
            return {"data": {"result": [
                {"metric": {"service_name": "chess-studio-backend"}, "value": [0, "4"]}
            ]}}

    # The diagnostic is observational only: it must not turn missing
    # telemetry into a successful attestation.
    diagnose_missing_coverage(DiagnosticGrafana(), "test-prom")
    healthy = {"data": {"result": [
        {"metric": {"service_name": service}, "value": [0, "12"]}
        for service in NATIVE_SERVICES
    ]}}
    verify_telemetry_coverage(healthy)
    for missing_payload in (
        {"data": {"result": []}},
        {"data": {"result": healthy["data"]["result"][:1]}},
        {"data": {"result": [
            {"metric": {"service_name": service}, "value": [0, "NaN"]}
            for service in NATIVE_SERVICES
        ]}},
        {"data": {"result": "not-a-vector"}},
    ):
        try:
            verify_telemetry_coverage(missing_payload)
        except SystemExit as exc:
            assert "cannot attest zero PvP fallback" in str(exc)
        else:
            raise AssertionError("missing or invalid telemetry must fail closed")
    good_ready = {
        "status": "ready",
        "service": "chess-studio-pvp-go",
        "runtimeService": "chess-studio-backend-go",
        "pythonRetired": True,
        "release": "a" * 40,
        **{f"nativeFeature{i}": True for i in range(31)},
    }
    urls = []
    def ready_fetcher(url: str) -> dict:
        urls.append(url)
        return dict(good_ready)
    verify_native_runtime(ready_fetcher)
    assert len(urls) == 2 and set(urls) == set(NATIVE_READY.values())
    for broken in (
        {"pythonRetired": False},
        {"nativeFeature0": False},
        {"release": "main"},
        {"runtimeService": "chess-studio-backend"},
        {"status": "not-ready"},
    ):
        try:
            verify_native_ready_payload({**good_ready, **broken}, "staging")
        except SystemExit as exc:
            assert "cannot attest zero PvP fallback" in str(exc)
        else:
            raise AssertionError(f"unsafe Go-only attestation accepted {broken}")

    bq = breakdown_query("chess-studio-backend-staging", 86400)
    assert 'route=~"/api/pvp.*"' in bq and "username" not in bq and "client_ip" not in bq
    brows = breakdown_rows({"data": {"result": [
        {"metric": {"route": "/api/pvp/lobby", "method": "GET", "peer_ip": "172.18.0.5"}, "value": [0, "12"]},
    ]}})
    assert brows == [{"route": "/api/pvp/lobby", "method": "GET", "hop": "?", "peer_ip": "172.18.0.5", "synthetic": "-", "requests": 12}]
    assert "172.18.0.5" in breakdown_markdown("staging", brows)
    trows = timeline_rows({"data": {"result": [{"metric": {"service_name": "chess-studio-backend-staging"},
                                                 "values": [[3600, "0"], [7200, "41.6"]]}]}})
    assert trows == [{"environment": "staging", "hour_end": 7200, "requests": 42}]
    assert "1970-01-01 02:00" in timeline_markdown(trows)
    class StubGrafana:
        calls = 0

        def get_list(self, path: str) -> list[dict]:
            assert path == "/api/datasources"
            self.calls += 1
            return [
                {"type": "prometheus", "uid": "test-prom"},
                {"type": "loki", "uid": "test-logs"},
            ]

    ready = StubGrafana()
    assert resolve_datasource_uids(ready, "configured-prom", "configured-logs", include_logs=True) == (
        "configured-prom", "configured-logs"
    )
    assert ready.calls == 0  # no fragile control-plane discovery on daily path
    assert resolve_datasource_uids(ready, "configured-prom", "", include_logs=False) == ("configured-prom", "")
    assert ready.calls == 0  # default schedule does not need Loki either
    discovery = StubGrafana()
    assert resolve_datasource_uids(discovery, "", "", include_logs=True) == ("test-prom", "test-logs")
    assert discovery.calls == 1  # fallback discovers once, reused for both UIDs

    class StaleGrafana:
        discovery_calls = 0
        queries = 0
        sleeps: list[int] = []

        def get_json(self, path: str, params: dict[str, str]) -> dict:
            self.queries += 1
            if "/old-prom/" in path:
                raise SystemExit("grafana-live-check FAIL · HTTP 404: {'message': 'Unable to find datasource'}")
            return {"data": {"result": []}}

        def get_list(self, path: str) -> list[dict]:
            assert path == "/api/datasources"
            self.discovery_calls += 1
            if self.discovery_calls == 1:
                raise SystemExit("grafana-live-check FAIL · HTTP 503: instance loading")
            return [{"type": "prometheus", "uid": "new-prom"}]

    stale = StaleGrafana()
    recovered_payload, recovered_uid = query_with_uid_recovery(
        stale, "old-prom", "prometheus", "/api/v1/query", {"query": "up"},
        sleep=lambda delay: stale.sleeps.append(delay),
    )
    assert recovered_uid == "new-prom" and recovered_payload == {"data": {"result": []}}
    assert stale.queries == 2 and stale.discovery_calls == 2 and stale.sleeps == [1]

    class TransientGrafana:
        calls = 0

        def get_json(self, path: str, params: dict[str, str]) -> dict:
            self.calls += 1
            if self.calls <= 2:
                code = (522, 503)[self.calls - 1]
                raise SystemExit(f"grafana-live-check FAIL · GET {path}: HTTP {code}: transient")
            return {"data": {"result": []}}

    transient = TransientGrafana()
    delays: list[int] = []
    recovered, uid = query_with_uid_recovery(
        transient, "prom", "prometheus", "/api/v1/query", {"query": "up"},
        sleep=delays.append,
    )
    assert transient.calls == 3 and delays == [1, 2]
    assert uid == "prom" and recovered == {"data": {"result": []}}

    class AlwaysUnavailable(TransientGrafana):
        def get_json(self, path: str, params: dict[str, str]) -> dict:
            self.calls += 1
            raise SystemExit(f"grafana-live-check FAIL · GET {path}: HTTP 503: DatasourceError")

    unavailable = AlwaysUnavailable()
    delays = []
    try:
        query_with_uid_recovery(
            unavailable, "prom", "prometheus", "/api/v1/query", {}, sleep=delays.append,
        )
    except SystemExit as exc:
        assert "HTTP 503" in str(exc)
    else:
        raise AssertionError("exhausted datasource retries must fail closed")
    assert unavailable.calls == 3 and delays == [1, 2]

    class DeniedGrafana(StaleGrafana):
        def get_json(self, path: str, params: dict[str, str]) -> dict:
            raise SystemExit("grafana-live-check FAIL · HTTP 403: Forbidden")

    denied = DeniedGrafana()
    try:
        query_with_uid_recovery(denied, "old-prom", "prometheus", "/api/v1/query", {})
    except SystemExit as exc:
        assert "HTTP 403" in str(exc)
    else:
        raise AssertionError("auth failure must remain fatal")
    assert denied.discovery_calls == 0

    print("pvp-python-fallback-report self-test OK")
    return 0


def main() -> int:
    if "--self-test" in sys.argv:
        return self_test()
    parser = argparse.ArgumentParser()
    parser.add_argument("--window", default=os.getenv("PVP_FALLBACK_WINDOW", "14d"))
    parser.add_argument("--max-requests", type=int, default=None,
                        help="fail when more fallback requests than this were seen")
    parser.add_argument("--summary", default=os.getenv("GITHUB_STEP_SUMMARY", ""))
    parser.add_argument("--timeline", action="store_true",
                        help="also list fallback requests hour by hour (max 7 days)")
    parser.add_argument("--sources", action="store_true",
                        help="also break the traffic down by hop and synthetic source (Loki)")
    args = parser.parse_args()

    window_seconds = _window_seconds(args.window)
    api = GrafanaReadApi(os.getenv("GRAFANA_URL", ""), os.getenv("GRAFANA_AUTH", ""))
    metrics_uid, logs_uid = resolve_datasource_uids(
        api,
        os.getenv("GRAFANA_METRICS_DATASOURCE_UID", ""),
        os.getenv("GRAFANA_LOGS_DATASOURCE_UID", ""),
        include_logs=args.sources,
    )
    payload, metrics_uid = query_with_uid_recovery(
        api, metrics_uid, "prometheus", "/api/v1/query",
        {"query": fallback_query(window_seconds), "time": str(int(time.time()))},
    )
    rows = parse_rows(payload)
    if not rows:
        # The Python service is retired. Require positive public Go-only
        # readiness and independent recent Go telemetry for both environments;
        # missing Python series alone cannot establish zero fallback.
        verify_native_runtime()
        control_payload, metrics_uid = query_with_uid_recovery(
            api, metrics_uid, "prometheus", "/api/v1/query",
            {"query": telemetry_coverage_query(window_seconds), "time": str(int(time.time()))},
        )
        try:
            verify_telemetry_coverage(control_payload)
        except SystemExit:
            diagnose_missing_coverage(api, metrics_uid)
            raise
        print(json.dumps({"check": "pvp_native_go_telemetry_coverage", "ok": True,
                          "lookback_seconds": min(window_seconds, 86400), "services": sorted(NATIVE_SERVICES),
                          "metric": "chess_studio_http_server_requests_total"},
                         separators=(",", ":"), sort_keys=True))
    report = markdown(rows, args.window)
    print(report)
    print(json.dumps({"check": "pvp_python_fallback", "window": args.window,
                      "total": sum(r["requests"] for r in rows), "rows": rows},
                     separators=(",", ":"), sort_keys=True))
    if args.summary:
        with open(args.summary, "a", encoding="utf-8") as handle:
            handle.write(report)
    if args.timeline:
        now = int(time.time())
        span = min(window_seconds, 7 * 86400)
        data, metrics_uid = query_with_uid_recovery(
            api, metrics_uid, "prometheus", "/api/v1/query_range",
            {"query": timeline_query(), "start": str(now - span), "end": str(now), "step": "3600"},
        )
        section = timeline_markdown(timeline_rows(data))
        print(section)
        if args.summary:
            with open(args.summary, "a", encoding="utf-8") as handle:
                handle.write(section)
    if args.sources:
        # Loki rejects very long ranges; the source breakdown is about now.
        log_window = min(window_seconds, 2 * 86400)
        for environment, service in LOG_SERVICES.items():
            data, logs_uid = query_with_uid_recovery(
                api, logs_uid, "loki", "/loki/api/v1/query",
                {"query": breakdown_query(service, log_window), "time": str(int(time.time()))},
            )
            section = breakdown_markdown(environment, breakdown_rows(data))
            print(section)
            if args.summary:
                with open(args.summary, "a", encoding="utf-8") as handle:
                    handle.write(section)
    total = sum(row["requests"] for row in rows)
    if args.max_requests is not None and total > args.max_requests:
        fail(f"{total} PvP requests reached Python in {args.window} (budget {args.max_requests})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
