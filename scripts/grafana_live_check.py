#!/usr/bin/env python3
"""Verify that recent Chess Studio telemetry is queryable from Grafana Cloud.

Standard-library only. This is deliberately a read-only end-to-end check: it
queries Grafana's configured Prometheus, Loki and Tempo data sources and fails
if expected OCI/backend signals are absent from the requested lookback window.
"""
from __future__ import annotations

import argparse
import json
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


def _vector_positive(payload: dict) -> bool:
    data = payload.get("data") if isinstance(payload, dict) else None
    result = data.get("result") if isinstance(data, dict) else None
    if not isinstance(result, list):
        return False
    for row in result:
        value = row.get("value") if isinstance(row, dict) else None
        if isinstance(value, list) and len(value) >= 2:
            try:
                if float(value[1]) > 0:
                    return True
            except (TypeError, ValueError):
                pass
    return False


def _tempo_has_result(payload: dict) -> bool:
    traces = payload.get("traces") if isinstance(payload, dict) else None
    if isinstance(traces, list):
        return bool(traces)
    data = payload.get("data") if isinstance(payload, dict) else None
    if isinstance(data, dict):
        nested = data.get("traces") or data.get("result")
        return isinstance(nested, list) and bool(nested)
    return False


def _report(name: str, ok: bool, detail: str) -> bool:
    print(json.dumps({"check": name, "ok": bool(ok), "detail": detail}, separators=(",", ":"), sort_keys=True))
    return bool(ok)


def run_checks(api: GrafanaReadApi, *, metrics_uid: str, logs_uid: str, traces_uid: str, lookback_seconds: int) -> bool:
    now = int(time.time())
    start = now - lookback_seconds
    passed = True

    metric_checks = {
        "oci_host_production": 'count({service_name="chess-studio-oci-host",deployment_environment="production"})',
        "backend_production_metrics": 'count({__name__=~"chess_studio_http_server_.*",service_name="chess-studio-backend"})',
    }
    for name, query in metric_checks.items():
        payload = api.get_json(
            f"/api/prometheus/{urllib.parse.quote(metrics_uid, safe='')}/api/v1/query",
            {"query": query, "time": str(now)},
        )
        ok = _vector_positive(payload)
        passed = _report(name, ok, "recent/queryable Prometheus series" if ok else "no matching Prometheus series") and passed

    log_query = f'sum(count_over_time({{service_name="chess-studio-backend"}}[{lookback_seconds}s]))'
    payload = api.get_json(
        f"/api/datasources/proxy/uid/{urllib.parse.quote(logs_uid, safe='')}/loki/api/v1/query",
        {"query": log_query, "time": str(now)},
    )
    ok = _vector_positive(payload)
    passed = _report("backend_production_logs", ok, "queryable Loki data" if ok else "no matching Loki data") and passed

    trace_query = '{ resource.service.name = "chess-studio-backend" }'
    payload = api.get_json(
        f"/api/datasources/proxy/uid/{urllib.parse.quote(traces_uid, safe='')}/api/search",
        {"q": trace_query, "start": str(start), "end": str(now), "limit": "1"},
    )
    ok = _tempo_has_result(payload)
    passed = _report("backend_production_traces", ok, "queryable Tempo trace" if ok else "no matching Tempo trace") and passed
    return passed


def self_test() -> int:
    assert _lookback_seconds("15m") == 900
    assert _lookback_seconds("3h") == 10800
    assert _vector_positive({"data": {"result": [{"value": [1, "1"]}]}})
    assert not _vector_positive({"data": {"result": [{"value": [1, "0"]}]}})
    assert not _vector_positive({"data": {"result": []}})
    assert _tempo_has_result({"traces": [{"traceID": "abc"}]})
    assert _tempo_has_result({"data": {"traces": [{"traceID": "abc"}]}})
    assert not _tempo_has_result({"traces": []})
    print("grafana-live-check self-test OK")
    return 0


def main() -> int:
    if "--self-test" in sys.argv:
        return self_test()
    parser = argparse.ArgumentParser()
    parser.add_argument("--lookback", default=os.getenv("GRAFANA_LIVE_LOOKBACK", "3h"))
    args = parser.parse_args()
    metrics_uid = os.getenv("GRAFANA_METRICS_DATASOURCE_UID", "").strip()
    logs_uid = os.getenv("GRAFANA_LOGS_DATASOURCE_UID", "").strip()
    traces_uid = os.getenv("GRAFANA_TRACES_DATASOURCE_UID", "").strip()
    missing = [name for name, value in (("metrics", metrics_uid), ("logs", logs_uid), ("traces", traces_uid)) if not value]
    if missing:
        fail("missing datasource UIDs: " + ", ".join(missing))
    api = GrafanaReadApi(os.getenv("GRAFANA_URL", ""), os.getenv("GRAFANA_AUTH", ""))
    return 0 if run_checks(api, metrics_uid=metrics_uid, logs_uid=logs_uid, traces_uid=traces_uid, lookback_seconds=_lookback_seconds(args.lookback)) else 1


if __name__ == "__main__":
    raise SystemExit(main())
