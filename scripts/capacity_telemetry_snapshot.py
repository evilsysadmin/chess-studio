#!/usr/bin/env python3
"""Read a compact staging capacity snapshot from Grafana Cloud."""
from __future__ import annotations

import argparse
import json
import os
import time

from grafana_live_check import GrafanaReadApi, _prom_value, _resolve_datasource_uid


HOST_SELECTOR = 'service_name="chess-studio-oci-host",deployment_environment="staging"'
BACKEND_SELECTOR = 'service_name="chess-studio-backend-staging"'


def queries() -> dict[str, str]:
    return {
        "host_cpu_percent": (
            f'100 * (1 - avg(rate(node_cpu_seconds_total{{{HOST_SELECTOR},mode="idle"}}[5m])))'
        ),
        "host_ram_percent": (
            f'100 * (1 - (avg(node_memory_MemAvailable_bytes{{{HOST_SELECTOR}}}) '
            f'/ avg(node_memory_MemTotal_bytes{{{HOST_SELECTOR}}})))'
        ),
        "host_load1": f'avg(node_load1{{{HOST_SELECTOR}}})',
        "backend_rps": f'sum(rate(chess_studio_http_server_requests_total{{{BACKEND_SELECTOR}}}[5m]))',
        "backend_5xx_rps": (
            f'sum(rate(chess_studio_http_server_requests_total{{{BACKEND_SELECTOR},'
            'http_response_status_class="5xx"}[5m]))'
        ),
        "backend_p95_ms": (
            '1000 * histogram_quantile(0.95, sum by (le) '
            f'(rate(chess_studio_http_server_duration_seconds_bucket{{{BACKEND_SELECTOR}}}[5m])))'
        ),
    }


def self_test() -> int:
    values = queries()
    assert "mode=\"idle\"" in values["host_cpu_percent"]
    assert "node_memory_MemAvailable_bytes" in values["host_ram_percent"]
    assert "chess-studio-backend-staging" in values["backend_p95_ms"]\n    assert "[5m]" in values["backend_rps"]
    print("Capacity telemetry snapshot self-test: OK")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--label", default="capacity")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        return self_test()

    api = GrafanaReadApi(os.getenv("GRAFANA_URL", ""), os.getenv("GRAFANA_AUTH", ""))
    metrics_uid = os.getenv("GRAFANA_METRICS_DATASOURCE_UID", "").strip()
    datasources = api.get_list("/api/datasources")
    if datasources is not None:
        metrics_uid = _resolve_datasource_uid(datasources, metrics_uid, "prometheus")
    elif not metrics_uid:
        raise SystemExit("capacity-telemetry: metrics datasource UID missing")

    now = int(time.time())
    snapshot = {
        key: _prom_value(api, metrics_uid, query, now)
        for key, query in queries().items()
    }
    print(json.dumps({
        "capacity_telemetry": {
            "label": args.label,
            "timestamp": now,
            **{key: None if value is None else round(value, 3) for key, value in snapshot.items()},
        }
    }, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
