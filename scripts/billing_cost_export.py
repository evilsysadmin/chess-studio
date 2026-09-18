#!/usr/bin/env python3
"""Export current OCI and Cloudflare billing cost to Grafana Cloud via OTLP/HTTP JSON."""
from __future__ import annotations

import argparse
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any

CLOUDFLARE_API = "https://api.cloudflare.com/client/v4"
METRIC_NAME = "chess_studio_billing_cost_current_cycle"
USER_AGENT = "ChessStudioBillingExporter/1"


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


def parse_otlp_headers(value: str) -> dict[str, str]:
    headers: dict[str, str] = {}
    for chunk in str(value or "").split(","):
        chunk = chunk.strip()
        if not chunk or "=" not in chunk:
            continue
        key, raw = chunk.split("=", 1)
        key = urllib.parse.unquote(key.strip())
        if key:
            headers[key] = urllib.parse.unquote(raw.strip())
    return headers


def signal_endpoint(base: str, signal: str = "metrics") -> str:
    suffix = f"/v1/{signal}"
    parts = urllib.parse.urlsplit(base.strip())
    path = (parts.path or "").rstrip("/")
    for known in ("/v1/traces", "/v1/metrics", "/v1/logs"):
        if path.endswith(known):
            path = path[:-len(known)].rstrip("/")
            break
    path = f"{path}{suffix}" if path else suffix
    return urllib.parse.urlunsplit((parts.scheme, parts.netloc, path, parts.query, parts.fragment))


def _cf_rows(payload: object) -> list[dict[str, Any]]:
    rows = payload.get("result") if isinstance(payload, dict) else payload
    if not isinstance(rows, list):
        raise SystemExit("Cloudflare billing response did not contain a result list")
    return [row for row in rows if isinstance(row, dict)]


def _single_currency(values: dict[str, float], provider: str) -> tuple[float, str]:
    clean = {currency: amount for currency, amount in values.items() if currency}
    if not clean:
        raise SystemExit(f"{provider}: billing API returned no currency/cost rows")
    if len(clean) != 1:
        raise SystemExit(f"{provider}: multiple billing currencies are not supported: {', '.join(sorted(clean))}")
    currency, amount = next(iter(clean.items()))
    return float(amount), currency


def collect_cloudflare_cost() -> tuple[float, str]:
    account_id = required_env("CLOUDFLARE_ACCOUNT_ID")
    token = (os.environ.get("CLOUDFLARE_BILLING_API_TOKEN") or os.environ.get("CLOUDFLARE_API_TOKEN") or "").strip()
    if not token:
        raise SystemExit("Missing CLOUDFLARE_BILLING_API_TOKEN (or CLOUDFLARE_API_TOKEN fallback)")
    request = urllib.request.Request(
        f"{CLOUDFLARE_API}/accounts/{urllib.parse.quote(account_id, safe='')}/billable-usage",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json", "User-Agent": USER_AGENT},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"Cloudflare billing API HTTP {exc.code}; token needs Account Billing Read") from None
    totals: dict[str, float] = {}
    for row in _cf_rows(payload):
        currency = str(row.get("BillingCurrency") or "").strip().upper()
        raw = row.get("BilledCost")
        if raw is None:
            continue
        totals[currency] = totals.get(currency, 0.0) + float(raw)
    return _single_currency(totals, "cloudflare")


def collect_oci_cost(oci: Any) -> tuple[float, str]:
    from oci_runtime_config import oci_config

    config = oci_config(oci)
    now = datetime.now(timezone.utc)
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    details = oci.usage_api.models.RequestSummarizedUsagesDetails(
        tenant_id=config["tenancy"],
        time_usage_started=start,
        time_usage_ended=now,
        granularity="MONTHLY",
        is_aggregate_by_time=True,
        query_type="COST",
        group_by=["currency"],
    )
    client = oci.usage_api.UsageapiClient(config)
    response = client.request_summarized_usages(details)
    totals: dict[str, float] = {}
    for row in list(getattr(response.data, "items", None) or []):
        currency = str(getattr(row, "currency", "") or "").strip().upper()
        amount = getattr(row, "computed_amount", None)
        if amount is None:
            continue
        totals[currency] = totals.get(currency, 0.0) + float(amount)
    return _single_currency(totals, "oci")


def build_otlp_payload(costs: list[tuple[str, float, str]], *, timestamp_ns: int | None = None) -> dict[str, Any]:
    stamp = str(int(timestamp_ns if timestamp_ns is not None else time.time_ns()))
    points = []
    for provider, amount, currency in costs:
        points.append(
            {
                "attributes": [
                    {"key": "provider", "value": {"stringValue": provider}},
                    {"key": "currency", "value": {"stringValue": currency}},
                    {"key": "scope", "value": {"stringValue": "current_cycle"}},
                ],
                "timeUnixNano": stamp,
                "asDouble": float(amount),
            }
        )
    return {
        "resourceMetrics": [
            {
                "resource": {
                    "attributes": [
                        {"key": "service.name", "value": {"stringValue": "chess-studio-billing-exporter"}},
                        {"key": "deployment.environment.name", "value": {"stringValue": "operations"}},
                    ]
                },
                "scopeMetrics": [
                    {
                        "scope": {"name": "chess-studio.billing"},
                        "metrics": [
                            {
                                "name": METRIC_NAME,
                                "description": "Current provider billing cost in the provider billing currency.",
                                "unit": "1",
                                "gauge": {"dataPoints": points},
                            }
                        ],
                    }
                ],
            }
        ]
    }


def publish_otlp(oci: Any, costs: list[tuple[str, float, str]]) -> None:
    from oci_runtime_bundle import read_private_runtime_values

    runtime = read_private_runtime_values(
        oci,
        ("OTEL_EXPORTER_OTLP_ENDPOINT", "OTEL_EXPORTER_OTLP_HEADERS"),
    )
    endpoint = signal_endpoint(runtime["OTEL_EXPORTER_OTLP_ENDPOINT"], "metrics")
    headers = parse_otlp_headers(runtime["OTEL_EXPORTER_OTLP_HEADERS"])
    headers.update({"Content-Type": "application/json", "Accept": "application/json", "User-Agent": USER_AGENT})
    body = json.dumps(build_otlp_payload(costs), separators=(",", ":")).encode("utf-8")
    request = urllib.request.Request(endpoint, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            if not 200 <= int(response.status) < 300:
                raise SystemExit(f"Grafana OTLP metrics export HTTP {response.status}")
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"Grafana OTLP metrics export HTTP {exc.code}") from None


def self_test() -> None:
    assert signal_endpoint("https://example.test/otlp", "metrics") == "https://example.test/otlp/v1/metrics"
    assert signal_endpoint("https://example.test/otlp/v1/traces", "metrics") == "https://example.test/otlp/v1/metrics"
    headers = parse_otlp_headers("Authorization=Basic%20abc%3D%3D,x-test=ok")
    assert headers["Authorization"] == "Basic abc=="
    assert _cf_rows({"result": [{"BilledCost": 0.25, "BillingCurrency": "USD"}]})[0]["BilledCost"] == 0.25
    assert _single_currency({"USD": 1.25}, "test") == (1.25, "USD")
    payload = build_otlp_payload([("oci", 0.0, "EUR"), ("cloudflare", 0.25, "USD")], timestamp_ns=123)
    metric = payload["resourceMetrics"][0]["scopeMetrics"][0]["metrics"][0]
    assert metric["name"] == METRIC_NAME
    assert len(metric["gauge"]["dataPoints"]) == 2
    assert metric["gauge"]["dataPoints"][0]["timeUnixNano"] == "123"
    print("billing-cost-export self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0

    import oci

    oci_cost, oci_currency = collect_oci_cost(oci)
    cf_cost, cf_currency = collect_cloudflare_cost()
    publish_otlp(
        oci,
        [
            ("oci", oci_cost, oci_currency),
            ("cloudflare", cf_cost, cf_currency),
        ],
    )
    print(
        "billing-cost-export OK · "
        f"oci={oci_cost:.2f} {oci_currency} · cloudflare={cf_cost:.2f} {cf_currency}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
