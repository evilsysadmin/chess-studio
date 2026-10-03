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
import os
import sys
import time
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from grafana_live_check import GrafanaReadApi, _resolve_datasource_uid, fail  # noqa: E402

SERVICES = {
    "chess-studio-backend": "production",
    "chess-studio-backend-staging": "staging",
}


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
    bq = breakdown_query("chess-studio-backend-staging", 86400)
    assert 'route=~"/api/pvp.*"' in bq and "username" not in bq and "client_ip" not in bq
    brows = breakdown_rows({"data": {"result": [
        {"metric": {"route": "/api/pvp/lobby", "method": "GET", "peer_ip": "172.18.0.5"}, "value": [0, "12"]},
    ]}})
    assert brows == [{"route": "/api/pvp/lobby", "method": "GET", "hop": "?", "peer_ip": "172.18.0.5", "synthetic": "-", "requests": 12}]
    assert "172.18.0.5" in breakdown_markdown("staging", brows)
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
    parser.add_argument("--sources", action="store_true",
                        help="also break the traffic down by hop and synthetic source (Loki)")
    args = parser.parse_args()

    window_seconds = _window_seconds(args.window)
    api = GrafanaReadApi(os.getenv("GRAFANA_URL", ""), os.getenv("GRAFANA_AUTH", ""))
    preferred = os.getenv("GRAFANA_METRICS_DATASOURCE_UID", "")
    datasources = api.get_list("/api/datasources")
    metrics_uid = _resolve_datasource_uid(datasources, preferred, "prometheus") if datasources is not None else preferred
    if not metrics_uid:
        fail("missing GRAFANA_METRICS_DATASOURCE_UID")
    payload = api.get_json(
        f"/api/datasources/proxy/uid/{urllib.parse.quote(metrics_uid, safe='')}/api/v1/query",
        {"query": fallback_query(window_seconds), "time": str(int(time.time()))},
    )
    rows = parse_rows(payload)
    report = markdown(rows, args.window)
    print(report)
    print(json.dumps({"check": "pvp_python_fallback", "window": args.window,
                      "total": sum(r["requests"] for r in rows), "rows": rows},
                     separators=(",", ":"), sort_keys=True))
    if args.summary:
        with open(args.summary, "a", encoding="utf-8") as handle:
            handle.write(report)
    if args.sources:
        preferred_logs = os.getenv("GRAFANA_LOGS_DATASOURCE_UID", "")
        logs_uid = _resolve_datasource_uid(datasources, preferred_logs, "loki") if datasources is not None else preferred_logs
        if not logs_uid:
            fail("missing GRAFANA_LOGS_DATASOURCE_UID")
        # Loki rejects very long ranges; the source breakdown is about now.
        log_window = min(window_seconds, 2 * 86400)
        for environment, service in LOG_SERVICES.items():
            data = api.get_json(
                f"/api/datasources/proxy/uid/{urllib.parse.quote(logs_uid, safe='')}/loki/api/v1/query",
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
