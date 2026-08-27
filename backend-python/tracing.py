"""Optional OpenTelemetry tracing for Chess Studio.

The backend stays fully functional when OTLP is not configured. When Grafana
Cloud OTLP credentials are present, FastAPI requests are exported to Tempo.
Observability must never become a runtime dependency for gameplay.
"""
from __future__ import annotations

import logging
import os
from typing import Any

LOGGER = logging.getLogger("uvicorn.error")
_CONFIGURED = False


def _truthy(value: str | None) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def tracing_settings(environ: dict[str, str] | None = None) -> dict[str, Any]:
    env = os.environ if environ is None else environ
    generic_endpoint = str(env.get("OTEL_EXPORTER_OTLP_ENDPOINT") or "").strip()
    traces_endpoint = str(env.get("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT") or "").strip()
    endpoint = traces_endpoint or generic_endpoint
    explicit = str(env.get("OTEL_TRACES_ENABLED") or "").strip()
    enabled = _truthy(explicit) if explicit else bool(endpoint)
    return {
        "enabled": enabled and bool(endpoint),
        "endpoint": endpoint,
        "service_name": str(env.get("OTEL_SERVICE_NAME") or "chess-studio-backend").strip()[:80],
        "environment": str(env.get("ENVIRONMENT") or "development").strip().lower()[:40],
        "sampler": str(env.get("OTEL_TRACES_SAMPLER") or "parentbased_traceidratio").strip()[:80],
        "sampler_arg": str(env.get("OTEL_TRACES_SAMPLER_ARG") or "0.20").strip()[:32],
    }


def current_trace_id() -> str | None:
    """Return the active trace id for log correlation, without hard dependency."""
    try:
        from opentelemetry import trace

        span = trace.get_current_span()
        context = span.get_span_context()
        if context and context.is_valid:
            return f"{context.trace_id:032x}"
    except Exception:
        pass
    return None


def configure_tracing(app: Any, *, release: str | None = None) -> bool:
    """Instrument FastAPI once. Fail-open by design.

    The OTLP HTTP exporter reads OTEL_EXPORTER_OTLP_HEADERS itself, which keeps
    the Grafana Cloud token out of application code and logs.
    """
    global _CONFIGURED
    if _CONFIGURED:
        return True

    settings = tracing_settings()
    if not settings["enabled"]:
        LOGGER.info("OpenTelemetry traces disabled: no OTLP endpoint configured.")
        return False

    try:
        # Set defaults before importing the SDK so its env sampler honours them.
        os.environ.setdefault("OTEL_TRACES_SAMPLER", settings["sampler"])
        os.environ.setdefault("OTEL_TRACES_SAMPLER_ARG", settings["sampler_arg"])
        os.environ.setdefault("OTEL_SERVICE_NAME", settings["service_name"])

        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        attributes = {
            "service.name": settings["service_name"],
            "deployment.environment.name": settings["environment"],
        }
        if release:
            attributes["service.version"] = str(release)[:80]
        provider = TracerProvider(resource=Resource.create(attributes))
        provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
        trace.set_tracer_provider(provider)
        FastAPIInstrumentor.instrument_app(app)
        HTTPXClientInstrumentor().instrument()
        _CONFIGURED = True
        LOGGER.info(
            "OpenTelemetry traces enabled for %s (%s, sampler=%s/%s).",
            settings["service_name"], settings["environment"], settings["sampler"], settings["sampler_arg"],
        )
        return True
    except Exception as exc:
        # A bad observability configuration must not make Render fail to boot.
        LOGGER.warning("OpenTelemetry tracing unavailable; continuing without traces: %s", type(exc).__name__)
        return False
