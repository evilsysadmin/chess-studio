#!/usr/bin/env python3
"""Verify that recent Chess Studio telemetry is queryable from Grafana Cloud.

Standard-library only. This is deliberately a read-only end-to-end check: it
queries Grafana's configured Prometheus, Loki and Tempo data sources and fails
if expected OCI/backend signals are absent from the requested lookback window.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


def fail(message: str) -> "NoReturn":
    raise SystemExit(f"grafana-live-check FAIL · {message}")


def _base_url(value: str) -> str:
    value = str(value or "").strip().rstrip("/")
    if not value.startswith(("https://", "http://")):
        fail("GRAFANA_URL must be an absolute http(s) URL")
    return value


def _lookback_seconds(raw: str) -> int:
    text = str(raw or "").strip().lower()
    if not text:
        return 3 * 60 * 60
    units = {"s": 1, "m": 60, "h": 3600, "d": 86400}
    suffix = text[-1]
    if suffix not in units or not text[:-1].isdigit():
        fail("lookback must look like 15m, 3h or 1d")
    value = int(text[:-1]) * units[suffix]
    if value < 60 or value > 7 * 86400:
        fail("lookback must be between 1m and 7d")
    return value


class GrafanaReadApi:
    def __init__(self, base_url: str, token: str) -> None:
        self.base_url = _base_url(base_url)
        self.token = str(token or "").strip()
        if not self.token:
            fail("missing GRAFANA_AUTH")

    def get_json(self, path: str, params: dict[str, str] | None = None) -> dict:
        query = "" if not params else "?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(
            self.base_url + path + query,
            headers={
                "Authorization": f"Bearer {self.token}",
                "Accept": "application/json",
                "User-Agent": "chess-studio-grafana-live-check/1",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=20) as response:
                raw = response.read().decode("utf-8")
                payload = json.loads(raw or "{}")
                status = int(response.status)
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8", errors="replace")
            try:
                payload = json.loads(raw or "{}")
            except json.JSONDecodeError:
                payload = {"raw": raw[:1000]}
            fail(f"GET {path}: HTTP {exc.code}: {payload}")
        except (OSError, TimeoutError) as exc:
            fail(f"GET {path}: {type(exc).__name__}: {exc}")
        if status != 200:
            fail(f"GET {path}: unexpected HTTP {status}")
        if not isinstance(payload, dict):
            fail(f"GET {path}: unexpected response shape")
        return payload

    def get_list(self, path: str) -> list[dict] | None:
        req = urllib.request.Request(
            self.base_url + path,
            headers={
                "Authorization": f"Bearer {self.token}",
                "Accept": "application/json",
                "User-Agent": "chess-studio-grafana-live-check/1",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=20) as response:
                raw = response.read().decode("utf-8")
                payload = json.loads(raw or "[]")
                status = int(response.status)
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8", errors="replace")
            try:
                payload = json.loads(raw or "{}")
            except json.JSONDecodeError:
                payload = {"raw": raw[:1000]}
            if exc.code == 403:
                print(json.dumps({
                    "check": "datasource_discovery",
                    "ok": True,
                    "detail": "datasources:read forbidden; keeping configured UIDs",
                }, separators=(",", ":"), sort_keys=True))
                return None
            fail(f"GET {path}: HTTP {exc.code}: {payload}")
        except (OSError, TimeoutError) as exc:
            fail(f"GET {path}: {type(exc).__name__}: {exc}")
        if status != 200:
            fail(f"GET {path}: unexpected HTTP {status}")
        if not isinstance(payload, list):
            fail(f"GET {path}: unexpected response shape")
        return [row for row in payload if isinstance(row, dict)]


def _vector_values(payload: dict) -> list[float]:
    data = payload.get("data") if isinstance(payload, dict) else None
    result = data.get("result") if isinstance(data, dict) else None
    if not isinstance(result, list):
        return []
    values: list[float] = []
    for row in result:
        value = row.get("value") if isinstance(row, dict) else None
        if not isinstance(value, list) or len(value) < 2:
            continue
        try:
            numeric = float(value[1])
        except (TypeError, ValueError):
            continue
        if math.isfinite(numeric):
            values.append(numeric)
    return values


def _vector_metric_rows(payload: dict) -> list[dict]:
    data = payload.get("data") if isinstance(payload, dict) else None
    result = data.get("result") if isinstance(data, dict) else None
    if not isinstance(result, list):
        return []
    rows: list[dict] = []
    for row in result:
        if not isinstance(row, dict):
            continue
        value = row.get("value")
        metric = row.get("metric")
        if not isinstance(value, list) or len(value) < 2 or not isinstance(metric, dict):
            continue
        try:
            numeric = float(value[1])
        except (TypeError, ValueError):
            continue
        if math.isfinite(numeric):
            rows.append({"metric": metric, "value": numeric})
    return rows


def _vector_positive(payload: dict) -> bool:
    return any(value > 0 for value in _vector_values(payload))


def _single_value(payload: dict) -> float | None:
    values = _vector_values(payload)
    return values[0] if values else None


def _tempo_has_result(payload: dict) -> bool:
    traces = payload.get("traces") if isinstance(payload, dict) else None
    if isinstance(traces, list):
        return bool(traces)
    data = payload.get("data") if isinstance(payload, dict) else None
    if isinstance(data, dict):
        nested = data.get("traces") or data.get("result")
        return isinstance(nested, list) and bool(nested)
    return False


def _resolve_datasource_uid(datasources: list[dict], preferred_uid: str, datasource_type: str) -> str:
    matches = [
        row for row in datasources
        if row.get("type") == datasource_type and str(row.get("uid") or "").strip()
    ]
    preferred_uid = str(preferred_uid or "").strip()
    if preferred_uid:
        preferred = next((row for row in matches if row.get("uid") == preferred_uid), None)
        if preferred:
            return preferred_uid

    # Grafana Cloud can expose auxiliary datasources backed by the same engine
    # (for example alert-state-history and usage-insights are Loki). Recover
    # only an unambiguous canonical stack datasource; never guess.
    canonical_suffixes = {
        "prometheus": ("-prom", "-prometheus"),
        "loki": ("-logs", "-loki"),
        "tempo": ("-traces", "-tempo"),
    }
    suffixes = canonical_suffixes.get(datasource_type, ())
    canonical = [
        row for row in matches
        if str(row.get("uid") or "").strip().lower().endswith(suffixes)
    ]
    defaults = [row for row in matches if row.get("isDefault")]
    if len(canonical) == 1:
        chosen = str(canonical[0]["uid"])
    elif len(defaults) == 1:
        chosen = str(defaults[0]["uid"])
    elif len(matches) == 1:
        chosen = str(matches[0]["uid"])
    else:
        available = ", ".join(sorted(str(row.get("uid")) for row in matches)) or "none"
        fail(
            f"cannot resolve {datasource_type} datasource UID"
            + (f" (preferred {preferred_uid!r} not present)" if preferred_uid else "")
            + f"; candidates: {available}"
        )
    print(json.dumps({
        "check": "datasource_uid_recovered",
        "type": datasource_type,
        "preferred_uid": preferred_uid or None,
        "resolved_uid": chosen,
    }, separators=(",", ":"), sort_keys=True))
    return chosen


def _report(name: str, ok: bool, detail: str) -> bool:
    print(json.dumps({"check": name, "ok": bool(ok), "detail": detail}, separators=(",", ":"), sort_keys=True))
    return bool(ok)


def _slo_report(name: str, value: float | None, limit: float, unit: str, *, evaluated: bool = True) -> bool:
    ok = (not evaluated) or (value is not None and value <= limit)
    payload = {
        "check": name,
        "ok": bool(ok),
        "evaluated": bool(evaluated),
        "value": None if value is None else round(value, 3),
        "limit": round(limit, 3),
        "unit": unit,
    }
    if not evaluated:
        payload["detail"] = "insufficient recent request sample"
    elif value is None:
        payload["detail"] = "metric missing while SLO evaluation was required"
    elif not ok:
        payload["detail"] = f"{value:.3f}{unit} exceeds {limit:.3f}{unit}"
    else:
        payload["detail"] = None
    print(json.dumps(payload, separators=(",", ":"), sort_keys=True))
    return bool(ok)


def _prom_value(api: GrafanaReadApi, metrics_uid: str, query: str, now: int) -> float | None:
    payload = api.get_json(
        f"/api/datasources/proxy/uid/{urllib.parse.quote(metrics_uid, safe='')}/api/v1/query",
        {"query": query, "time": str(now)},
    )
    return _single_value(payload)


def run_checks(
    api: GrafanaReadApi,
    *,
    metrics_uid: str,
    logs_uid: str,
    traces_uid: str,
    lookback_seconds: int,
    max_5xx_percent: float,
    max_p95_ms: float,
    max_host_ram_percent: float,
    min_requests_15m: int,
    expected_staging_sha: str | None,
) -> bool:
    now = int(time.time())
    version_selector = (
        f'service_version="{expected_staging_sha}"'
        if expected_staging_sha
        else 'service_version=~".+"'
    )
    start = now - lookback_seconds
    passed = True

    host_inventory_payload = api.get_json(
        f"/api/datasources/proxy/uid/{urllib.parse.quote(metrics_uid, safe='')}/api/v1/query",
        {
            "query": 'count by (job, service_name, deployment_environment, cloud_provider, cloud_region, service_version) ({__name__=~"node_.*"})',
            "time": str(now),
        },
    )
    host_node_inventory = [
        {
            "job": str(row["metric"].get("job") or ""),
            "service_name": str(row["metric"].get("service_name") or ""),
            "deployment_environment": str(row["metric"].get("deployment_environment") or ""),
            "cloud_provider": str(row["metric"].get("cloud_provider") or ""),
            "cloud_region": str(row["metric"].get("cloud_region") or ""),
            "service_version": str(row["metric"].get("service_version") or ""),
            "series": int(row["value"]),
        }
        for row in _vector_metric_rows(host_inventory_payload)
    ]
    print(json.dumps({
        "check": "host_node_inventory",
        "rows": host_node_inventory,
    }, separators=(",", ":"), sort_keys=True))

    metric_checks = {
        "alloy_self_staging": f'count({{service_name="chess-studio-alloy-self",deployment_environment="staging",cloud_provider="oci",cloud_region="eu-frankfurt-1",{version_selector}}})',
        "oci_host_staging": f'count({{service_name="chess-studio-oci-host",deployment_environment="staging",cloud_provider="oci",cloud_region="eu-frankfurt-1",{version_selector}}})',
        "backend_production_metrics": f'count(count_over_time(chess_studio_http_server_requests_total{{service_name="chess-studio-backend"}}[{lookback_seconds}s]))',
        "backend_staging_metrics": f'count(count_over_time(chess_studio_http_server_requests_total{{service_name="chess-studio-backend-staging"}}[{lookback_seconds}s]))',
    }
    for name, query in metric_checks.items():
        payload = api.get_json(
            f"/api/datasources/proxy/uid/{urllib.parse.quote(metrics_uid, safe='')}/api/v1/query",
            {"query": query, "time": str(now)},
        )
        ok = _vector_positive(payload)
        passed = _report(name, ok, "recent/queryable Prometheus series" if ok else "no matching Prometheus series") and passed

    requests_15m = _prom_value(
        api,
        metrics_uid,
        'sum(increase(chess_studio_http_server_requests_total{service_name="chess-studio-backend",http_route!="/api/ready"}[15m])) or vector(0)',
        now,
    )
    errors_15m = _prom_value(
        api,
        metrics_uid,
        'sum(increase(chess_studio_http_server_requests_total{service_name="chess-studio-backend",http_route!="/api/ready",http_response_status_class="5xx"}[15m])) or vector(0)',
        now,
    )
    p95_ms = _prom_value(
        api,
        metrics_uid,
        '1000 * histogram_quantile(0.95, sum by (le) (rate(chess_studio_http_server_duration_seconds_bucket{service_name="chess-studio-backend",http_route!="/api/ready"}[15m])))',
        now,
    )
    route_p95_payload = api.get_json(
        f"/api/datasources/proxy/uid/{urllib.parse.quote(metrics_uid, safe='')}/api/v1/query",
        {
            "query": 'topk(8, 1000 * histogram_quantile(0.95, sum by (le, http_route) (rate(chess_studio_http_server_duration_seconds_bucket{service_name="chess-studio-backend"}[15m]))))',
            "time": str(now),
        },
    )
    route_p95 = [
        {
            "route": str(row["metric"].get("http_route") or "<unmatched>"),
            "p95_ms": round(row["value"], 3),
        }
        for row in _vector_metric_rows(route_p95_payload)
    ]
    route_p95.sort(key=lambda row: row["p95_ms"], reverse=True)
    print(json.dumps({
        "check": "backend_route_p95_diagnostic",
        "routes": route_p95,
    }, separators=(",", ":"), sort_keys=True))
    host_ram_percent = _prom_value(
        api,
        metrics_uid,
        '100 * (1 - (avg(node_memory_MemAvailable_bytes{service_name="chess-studio-oci-host",deployment_environment="staging"}) / avg(node_memory_MemTotal_bytes{service_name="chess-studio-oci-host",deployment_environment="staging"})))',
        now,
    )
    enough_requests = requests_15m is not None and requests_15m >= min_requests_15m
    error_percent = None
    if enough_requests and errors_15m is not None and requests_15m:
        error_percent = 100.0 * errors_15m / requests_15m
    passed = _slo_report(
        "backend_5xx_percent",
        error_percent,
        max_5xx_percent,
        "%",
        evaluated=enough_requests,
    ) and passed
    passed = _slo_report(
        "backend_p95_ms",
        p95_ms,        max_p95_ms,
        "ms",
        evaluated=enough_requests,
    ) and passed
    passed = _slo_report(
        "oci_host_ram_percent",
        host_ram_percent,
        max_host_ram_percent,
        "%",
    ) and passed
    staging_requests_15m = _prom_value(
        api,
        metrics_uid,
        'sum(increase(chess_studio_http_server_requests_total{service_name="chess-studio-backend-staging",http_route!="/api/ready"}[15m])) or vector(0)',
        now,
    )
    staging_errors_15m = _prom_value(
        api,
        metrics_uid,
        'sum(increase(chess_studio_http_server_requests_total{service_name="chess-studio-backend-staging",http_route!="/api/ready",http_response_status_class="5xx"}[15m])) or vector(0)',
        now,
    )
    staging_p95_ms = _prom_value(
        api,
        metrics_uid,
        '1000 * histogram_quantile(0.95, sum by (le) (rate(chess_studio_http_server_duration_seconds_bucket{service_name="chess-studio-backend-staging",http_route!="/api/ready"}[15m])))',
        now,
    )
    staging_enough_requests = staging_requests_15m is not None and staging_requests_15m >= min_requests_15m
    staging_error_percent = None
    if staging_enough_requests and staging_errors_15m is not None and staging_requests_15m:
        staging_error_percent = 100.0 * staging_errors_15m / staging_requests_15m
    passed = _slo_report(
        "backend_staging_5xx_percent",
        staging_error_percent,
        max_5xx_percent,
        "%",
        evaluated=staging_enough_requests,
    ) and passed
    passed = _slo_report(
        "backend_staging_p95_ms",
        staging_p95_ms,
        max_p95_ms,
        "ms",
        evaluated=staging_enough_requests,
    ) and passed

    log_query = f'sum(count_over_time({{service_name="chess-studio-backend"}}[{lookback_seconds}s]))'
    payload = api.get_json(
        f"/api/datasources/proxy/uid/{urllib.parse.quote(logs_uid, safe='')}/loki/api/v1/query",
        {"query": log_query, "time": str(now)},
    )
    ok = _vector_positive(payload)
    passed = _report("backend_production_logs", ok, "queryable Loki data" if ok else "no matching Loki data") and passed

    staging_log_query = f'sum(count_over_time({{service_name="chess-studio-backend-staging"}}[{lookback_seconds}s]))'
    payload = api.get_json(
        f"/api/datasources/proxy/uid/{urllib.parse.quote(logs_uid, safe='')}/loki/api/v1/query",
        {"query": staging_log_query, "time": str(now)},
    )
    ok = _vector_positive(payload)
    passed = _report("backend_staging_logs", ok, "queryable Loki data" if ok else "no matching Loki data") and passed

    loki_inventory_query = (
        f'sum by (service_name) (count_over_time({{service_name=~"chess-studio.*"}}[{lookback_seconds}s]))'
    )
    payload = api.get_json(
        f"/api/datasources/proxy/uid/{urllib.parse.quote(logs_uid, safe='')}/loki/api/v1/query",
        {"query": loki_inventory_query, "time": str(now)},
    )
    loki_service_inventory = [
        {
            "service_name": str(row["metric"].get("service_name") or ""),
            "lines": int(row["value"]),
        }
        for row in _vector_metric_rows(payload)
    ]
    print(json.dumps({
        "check": "loki_service_inventory",
        "rows": loki_service_inventory,
    }, separators=(",", ":"), sort_keys=True))

    direct_probe_filters = ' |= "oci_otlp_log_probe"'
    if expected_staging_sha:
        direct_probe_filters += f' |= "{expected_staging_sha}"'
    direct_probe_query = (
        'sum(count_over_time({service_name="chess-studio-oci-log-probe-staging"}'
        f'{direct_probe_filters} [{lookback_seconds}s]))'
    )
    payload = api.get_json(
        f"/api/datasources/proxy/uid/{urllib.parse.quote(logs_uid, safe='')}/loki/api/v1/query",
        {"query": direct_probe_query, "time": str(now)},
    )
    direct_probe_ok = _vector_positive(payload)
    passed = _report(
        "oci_otlp_direct_log_probe",
        direct_probe_ok,
        "direct OTLP /v1/logs probe reached Loki"
        if direct_probe_ok
        else "direct OTLP /v1/logs probe missing; inspect endpoint/auth and logs:write scope",
    ) and passed

    probe_filters = ' |= "oci_alloy_probe"'
    if expected_staging_sha:
        probe_filters += f' |= "{expected_staging_sha}"'
    oci_probe_query = (
        'sum(count_over_time({service_name="chess-studio-oci-backend-staging-stdout"}'
        f'{probe_filters} [{lookback_seconds}s]))'
    )
    payload = api.get_json(
        f"/api/datasources/proxy/uid/{urllib.parse.quote(logs_uid, safe='')}/loki/api/v1/query",
        {"query": oci_probe_query, "time": str(now)},
    )
    ok = _vector_positive(payload)
    passed = _report(
        "oci_filelog_probe",
        ok,
        "Alloy filelog probe reached Loki"
        if ok
        else (
            "direct OTLP logs work but Alloy filelog probe is missing"
            if direct_probe_ok
            else "Alloy filelog probe missing and direct OTLP logs are also unavailable"
        ),
    ) and passed

    oci_stdout_log_query = (
        'sum(count_over_time({service_name="chess-studio-oci-backend-staging-stdout"}'
        ' | json | __error__="" | event="http_request"'
        f' [{lookback_seconds}s]))'
    )
    payload = api.get_json(
        f"/api/datasources/proxy/uid/{urllib.parse.quote(logs_uid, safe='')}/loki/api/v1/query",
        {"query": oci_stdout_log_query, "time": str(now)},
    )
    ok = _vector_positive(payload)
    passed = _report(
        "oci_backend_stdout_logs",
        ok,
        "structured backend stdout reached Loki"
        if ok
        else (
            "direct OTLP logs work but backend stdout capture is missing"
            if direct_probe_ok
            else "backend stdout missing while the direct OTLP log path is also unavailable"
        ),
    ) and passed

    log_explorer_default_query = (
        'sum(count_over_time({service_name="chess-studio-backend"}'
        ' | json | __error__=""'
        ' | event="http_request" | status=~".*" | method=~".*" | route=~".*"'
        ' | request_path=~".*" | client_release=~".*" | request_id=~".*" | trace_id=~".*"'
        f' |~ ".*" [{lookback_seconds}s]))'
    )
    api.get_json(
        f"/api/datasources/proxy/uid/{urllib.parse.quote(logs_uid, safe='')}/loki/api/v1/query",
        {"query": log_explorer_default_query, "time": str(now)},
    )
    passed = _report("log_explorer_default_query", True, "default Explorer LogQL accepted by Loki") and passed

    trace_query = '{ resource.service.name = "chess-studio-backend" && resource.deployment.environment.name = "production" }'
    payload = api.get_json(
        f"/api/datasources/proxy/uid/{urllib.parse.quote(traces_uid, safe='')}/api/search",
        {"q": trace_query, "start": str(start), "end": str(now), "limit": "1"},
    )
    ok = _tempo_has_result(payload)
    passed = _report("backend_production_traces", ok, "queryable Tempo trace" if ok else "no matching Tempo trace") and passed

    staging_trace_query = '{ resource.service.name = "chess-studio-backend-staging" && resource.deployment.environment.name = "staging" }'
    payload = api.get_json(
        f"/api/datasources/proxy/uid/{urllib.parse.quote(traces_uid, safe='')}/api/search",
        {"q": staging_trace_query, "start": str(start), "end": str(now), "limit": "1"},
    )
    ok = _tempo_has_result(payload)
    passed = _report("backend_staging_traces", ok, "queryable Tempo trace" if ok else "no matching Tempo trace") and passed

    contamination_queries = {
        "backend_production_environment_isolation": '{ resource.service.name = "chess-studio-backend" && resource.deployment.environment.name = "staging" }',
        "backend_staging_environment_isolation": '{ resource.service.name = "chess-studio-backend-staging" && resource.deployment.environment.name = "production" }',
    }
    for name, query in contamination_queries.items():
        payload = api.get_json(
            f"/api/datasources/proxy/uid/{urllib.parse.quote(traces_uid, safe='')}/api/search",
            {"q": query, "start": str(start), "end": str(now), "limit": "1"},
        )
        contaminated = _tempo_has_result(payload)
        passed = _report(name, not contaminated, "no cross-environment trace identity" if not contaminated else "cross-environment trace identity found") and passed
    return passed


def self_test() -> int:
    assert _lookback_seconds("15m") == 900
    assert _lookback_seconds("3h") == 10800
    assert _vector_positive({"data": {"result": [{"value": [1, "1"]}]}})
    assert not _vector_positive({"data": {"result": [{"value": [1, "0"]}]}})
    assert _vector_values({"data": {"result": [{"value": [1, "2.5"]}, {"value": [1, "NaN"]}]}}) == [2.5]
    assert _vector_metric_rows({
        "data": {"result": [{"metric": {"http_route": "/api/ready"}, "value": [1, "12.5"]}]}
    }) == [{"metric": {"http_route": "/api/ready"}, "value": 12.5}]
    assert _single_value({"data": {"result": [{"value": [1, "42"]}]}}) == 42.0
    assert not _vector_positive({"data": {"result": []}})
    assert _tempo_has_result({"traces": [{"traceID": "abc"}]})
    assert _tempo_has_result({"data": {"traces": [{"traceID": "abc"}]}})
    assert not _tempo_has_result({"traces": []})
    assert 'deployment.environment.name = "production"' in '{ resource.deployment.environment.name = "production" }'
    sample_datasources = [
        {"uid": "grafanacloud-prom", "type": "prometheus", "isDefault": True},
        {"uid": "grafanacloud-alert-state-history", "type": "loki", "isDefault": False},
        {"uid": "grafanacloud-logs", "type": "loki", "isDefault": False},
        {"uid": "grafanacloud-usage-insights", "type": "loki", "isDefault": False},
        {"uid": "grafanacloud-traces", "type": "tempo", "isDefault": False},
    ]
    assert _resolve_datasource_uid(sample_datasources, "stale-prom", "prometheus") == "grafanacloud-prom"
    assert _resolve_datasource_uid(sample_datasources, "stale-logs", "loki") == "grafanacloud-logs"
    assert _resolve_datasource_uid(sample_datasources, "stale-traces", "tempo") == "grafanacloud-traces"
    assert _slo_report("self-pass", 4.0, 5.0, "%")
    assert not _slo_report("self-fail", 6.0, 5.0, "%")
    assert _slo_report("self-skip", None, 5.0, "%", evaluated=False)
    print("grafana-live-check self-test OK")
    return 0


def main() -> int:
    if "--self-test" in sys.argv:
        return self_test()
    parser = argparse.ArgumentParser()
    parser.add_argument("--lookback", default=os.getenv("GRAFANA_LIVE_LOOKBACK", "3h"))
    parser.add_argument("--max-5xx-percent", type=float, default=os.getenv("GRAFANA_SLO_MAX_5XX_PERCENT", "5"))
    parser.add_argument("--max-p95-ms", type=float, default=os.getenv("GRAFANA_SLO_MAX_P95_MS", "3000"))
    parser.add_argument("--max-host-ram-percent", type=float, default=os.getenv("GRAFANA_SLO_MAX_HOST_RAM_PERCENT", "90"))
    parser.add_argument("--min-requests-15m", type=int, default=os.getenv("GRAFANA_SLO_MIN_REQUESTS_15M", "20"))
    args = parser.parse_args()
    if args.max_5xx_percent <= 0 or args.max_p95_ms <= 0 or args.max_host_ram_percent <= 0:
        fail("SLO limits must be positive")
    if args.min_requests_15m < 1:
        fail("GRAFANA_SLO_MIN_REQUESTS_15M must be >= 1")
    metrics_uid = os.getenv("GRAFANA_METRICS_DATASOURCE_UID", "").strip()
    logs_uid = os.getenv("GRAFANA_LOGS_DATASOURCE_UID", "").strip()
    traces_uid = os.getenv("GRAFANA_TRACES_DATASOURCE_UID", "").strip()
    expected_staging_sha = os.getenv("EXPECTED_STAGING_SHA", "").strip().lower()
    if expected_staging_sha and (
        len(expected_staging_sha) != 40
        or any(ch not in "0123456789abcdef" for ch in expected_staging_sha)
    ):
        fail("EXPECTED_STAGING_SHA must be an empty value or a 40-character git SHA")
    api = GrafanaReadApi(os.getenv("GRAFANA_URL", ""), os.getenv("GRAFANA_AUTH", ""))
    datasources = api.get_list("/api/datasources")
    if datasources is not None:
        metrics_uid = _resolve_datasource_uid(datasources, metrics_uid, "prometheus")
        logs_uid = _resolve_datasource_uid(datasources, logs_uid, "loki")
        traces_uid = _resolve_datasource_uid(datasources, traces_uid, "tempo")
    else:
        missing = [
            name for name, value in (
                ("metrics", metrics_uid),
                ("logs", logs_uid),
                ("traces", traces_uid),
            )
            if not value
        ]
        if missing:
            fail("datasource discovery forbidden and configured UIDs missing: " + ", ".join(missing))
    return 0 if run_checks(
        api,
        metrics_uid=metrics_uid,
        logs_uid=logs_uid,
        traces_uid=traces_uid,
        lookback_seconds=_lookback_seconds(args.lookback),
        max_5xx_percent=args.max_5xx_percent,
        max_p95_ms=args.max_p95_ms,
        max_host_ram_percent=args.max_host_ram_percent,
        min_requests_15m=args.min_requests_15m,
        expected_staging_sha=expected_staging_sha or None,
    ) else 1


if __name__ == "__main__":
    raise SystemExit(main())