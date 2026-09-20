#!/usr/bin/env python3
"""Send one safe OTLP/HTTP JSON log probe without exposing credentials."""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

_SIGNAL_SUFFIXES = ("/v1/traces", "/v1/metrics", "/v1/logs")


def fail(message: str, *, status: int | None = None) -> "NoReturn":
    parts = ["OTLP_LOG_PROBE_FAIL"]
    if status is not None:
        parts.append(f"http_status={status}")
    parts.append(f"reason={message}")
    raise SystemExit(" ".join(parts))


def parse_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    text = path.read_text(encoding="utf-8")
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key] = value
    return values


def logs_endpoint(generic: str) -> str:
    value = str(generic or "").strip()
    if not value:
        return ""
    parts = urlsplit(value)
    if parts.scheme not in {"http", "https"} or not parts.netloc:
        return ""
    path = (parts.path or "").rstrip("/")
    for suffix in _SIGNAL_SUFFIXES:
        if path.endswith(suffix):
            path = path[:-len(suffix)].rstrip("/")
            break
    path = f"{path}/v1/logs" if path else "/v1/logs"
    return urlunsplit((parts.scheme, parts.netloc, path, parts.query, parts.fragment))


def parse_headers(raw: str) -> dict[str, str]:
    headers: dict[str, str] = {}
    for chunk in str(raw or "").split(","):
        chunk = chunk.strip()
        if not chunk or "=" not in chunk:
            continue
        key, value = chunk.split("=", 1)
        key = urllib.parse.unquote(key.strip())
        if not key:
            continue
        headers[key] = urllib.parse.unquote(value.strip())
    return headers


def build_payload(service_name: str, environment: str, service_version: str) -> bytes:
    body = json.dumps(
        {
            "event": "oci_otlp_log_probe",
            "environment": environment,
            "service_version": service_version,
        },
        separators=(",", ":"),
        sort_keys=True,
    )
    now_ns = str(time.time_ns())
    payload = {
        "resourceLogs": [
            {
                "resource": {
                    "attributes": [
                        {"key": "service.name", "value": {"stringValue": service_name}},
                        {"key": "deployment.environment.name", "value": {"stringValue": environment}},
                        {"key": "service.version", "value": {"stringValue": service_version}},
                        {"key": "cloud.provider", "value": {"stringValue": "oci"}},
                        {"key": "cloud.region", "value": {"stringValue": "eu-frankfurt-1"}},
                    ]
                },
                "scopeLogs": [
                    {
                        "scope": {"name": "chess-studio.oci-log-probe"},
                        "logRecords": [
                            {
                                "timeUnixNano": now_ns,
                                "observedTimeUnixNano": now_ns,
                                "severityText": "INFO",
                                "body": {"stringValue": body},
                            }
                        ],
                    }
                ],
            }
        ]
    }
    return json.dumps(payload, separators=(",", ":")).encode("utf-8")


def send_probe(env_file: Path, service_name: str, environment: str, service_version: str) -> int:
    values = parse_env(env_file)
    endpoint = logs_endpoint(values.get("OTEL_EXPORTER_OTLP_ENDPOINT", ""))
    headers = parse_headers(values.get("OTEL_EXPORTER_OTLP_HEADERS", ""))
    if not endpoint:
        fail("endpoint-missing")
    if "Authorization" not in headers and "authorization" not in headers:
        fail("authorization-header-missing")

    request_headers = dict(headers)
    request_headers["Content-Type"] = "application/json"
    request_headers["Accept"] = "application/json"
    request_headers["User-Agent"] = "chess-studio-oci-log-probe/1"
    req = urllib.request.Request(
        endpoint,
        data=build_payload(service_name, environment, service_version),
        method="POST",
        headers=request_headers,
    )
    try:
        with urllib.request.urlopen(req, timeout=12) as response:
            status = int(response.status)
            response.read(2048)
    except urllib.error.HTTPError as exc:
        status = int(exc.code)
        if status in {401, 403}:
            fail("authorization", status=status)
        fail("http-rejected", status=status)
    except (OSError, TimeoutError) as exc:
        fail(type(exc).__name__.lower())

    if not 200 <= status < 300:
        fail("unexpected-http", status=status)
    print(f"OTLP_LOG_PROBE_OK http_status={status} service={service_name} environment={environment}")
    return 0


def self_test() -> int:
    assert logs_endpoint("https://otlp.example/otlp") == "https://otlp.example/otlp/v1/logs"
    assert logs_endpoint("https://otlp.example/otlp/v1/traces") == "https://otlp.example/otlp/v1/logs"
    assert logs_endpoint("https://otlp.example/otlp/v1/logs") == "https://otlp.example/otlp/v1/logs"
    assert parse_headers("Authorization=Basic%20abc,X-Scope-OrgID=42") == {
        "Authorization": "Basic abc",
        "X-Scope-OrgID": "42",
    }
    payload = json.loads(build_payload("svc", "staging", "a" * 40))
    attrs = payload["resourceLogs"][0]["resource"]["attributes"]
    assert {"key": "service.name", "value": {"stringValue": "svc"}} in attrs
    assert "oci_otlp_log_probe" in payload["resourceLogs"][0]["scopeLogs"][0]["logRecords"][0]["body"]["stringValue"]
    print("OTLP log probe self-test: OK")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--env-file")
    parser.add_argument("--service-name")
    parser.add_argument("--environment")
    parser.add_argument("--service-version")
    args = parser.parse_args()
    if args.self_test:
        return self_test()
    if not all((args.env_file, args.service_name, args.environment, args.service_version)):
        parser.error("--env-file, --service-name, --environment and --service-version are required")
    version = str(args.service_version).strip().lower()
    if len(version) != 40 or any(ch not in "0123456789abcdef" for ch in version):
        fail("invalid-service-version")
    environment = str(args.environment).strip().lower()
    if environment not in {"staging", "production"}:
        fail("invalid-environment")
    service_name = str(args.service_name).strip()
    if not service_name or len(service_name) > 100:
        fail("invalid-service-name")
    return send_probe(Path(args.env_file), service_name, environment, version)


if __name__ == "__main__":
    raise SystemExit(main())
