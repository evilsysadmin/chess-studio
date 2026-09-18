#!/usr/bin/env python3
"""Collect OCI + Cloudflare billing and hand the signed sample to Chess Studio staging."""
from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Any

CLOUDFLARE_API = "https://api.cloudflare.com/client/v4"
DEFAULT_INGEST_URL = "https://api-staging.chess-studio.shadowops.dpdns.org/api/internal/billing-costs"
USER_AGENT = "ChessStudioBillingExporter/1"


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


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


def _oci_month_window(now: datetime) -> tuple[datetime, datetime]:
    current = now.astimezone(timezone.utc)
    start = current.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    end = current.replace(hour=0, minute=0, second=0, microsecond=0)
    if end <= start:
        # On the first UTC day of a month OCI has no complete current-month day
        # yet. Query the previous complete month to preserve a valid billing
        # currency/sample instead of sending an invalid zero-length interval.
        end = start
        previous_day = start - timedelta(days=1)
        start = previous_day.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return start, end


def collect_oci_cost(oci: Any) -> tuple[float, str]:
    from oci_runtime_config import oci_config

    config = oci_config(oci)
    start, end = _oci_month_window(datetime.now(timezone.utc))
    details = oci.usage_api.models.RequestSummarizedUsagesDetails(
        tenant_id=config["tenancy"],
        time_usage_started=start,
        time_usage_ended=end,
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


def encode_payload(costs: list[tuple[str, float, str]]) -> bytes:
    return json.dumps(
        {
            "costs": [
                {"provider": provider, "amount": float(amount), "currency": currency}
                for provider, amount, currency in costs
            ]
        },
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def sign_payload(secret: str, timestamp: str, body: bytes) -> str:
    digest = hmac.new(
        secret.encode("utf-8"),
        timestamp.encode("ascii") + b"." + body,
        hashlib.sha256,
    ).hexdigest()
    return f"sha256={digest}"


def publish_via_staging(oci: Any, costs: list[tuple[str, float, str]]) -> None:
    from oci_runtime_bundle import read_private_runtime_value

    secret = read_private_runtime_value(oci, "CHESS_AI_SHARED_SECRET")
    url = os.environ.get("CHESS_STUDIO_BILLING_INGEST_URL", DEFAULT_INGEST_URL).strip() or DEFAULT_INGEST_URL
    body = encode_payload(costs)
    timestamp = str(int(time.time()))
    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": USER_AGENT,
            "X-Chess-Timestamp": timestamp,
            "X-Chess-Signature": sign_payload(secret, timestamp, body),
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            if int(response.status) != 204:
                raise SystemExit(f"billing ingest returned HTTP {response.status}")
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"billing ingest returned HTTP {exc.code}") from None


def self_test() -> None:
    sample_now = datetime(2026, 9, 18, 14, 38, 17, 123456, tzinfo=timezone.utc)
    start, end = _oci_month_window(sample_now)
    assert start == datetime(2026, 9, 1, tzinfo=timezone.utc)
    assert end == datetime(2026, 9, 18, tzinfo=timezone.utc)
    first_day_start, first_day_end = _oci_month_window(
        datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)
    )
    assert first_day_start == datetime(2026, 9, 1, tzinfo=timezone.utc)
    assert first_day_end == datetime(2026, 10, 1, tzinfo=timezone.utc)
    assert all(
        value.hour == value.minute == value.second == value.microsecond == 0
        for value in (start, end, first_day_start, first_day_end)
    )
    assert _cf_rows({"result": [{"BilledCost": 0.25, "BillingCurrency": "USD"}]})[0]["BilledCost"] == 0.25
    assert _single_currency({"USD": 1.25}, "test") == (1.25, "USD")
    body = encode_payload([("oci", 0.0, "EUR"), ("cloudflare", 0.25, "USD")])
    parsed = json.loads(body)
    assert parsed["costs"][0] == {"amount": 0.0, "currency": "EUR", "provider": "oci"}
    expected = hmac.new(b"secret", b"123." + body, hashlib.sha256).hexdigest()
    assert sign_payload("secret", "123", body) == f"sha256={expected}"
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
    costs = [
        ("oci", oci_cost, oci_currency),
        ("cloudflare", cf_cost, cf_currency),
    ]
    publish_via_staging(oci, costs)
    print(
        "billing-cost-export OK · "
        f"oci={oci_cost:.2f} {oci_currency} · cloudflare={cf_cost:.2f} {cf_currency}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
