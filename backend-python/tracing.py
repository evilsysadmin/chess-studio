"""Optional OpenTelemetry tracing for Chess Studio.

The backend stays fully functional when OTLP is not configured. When Grafana
Cloud OTLP credentials are present, FastAPI requests are exported to Tempo.
Observability must never become a runtime dependency for gameplay.
"""
from __future__ import annotations

import logging
import os
import secrets
from typing import Any

LOGGER = logging.getLogger("uvicorn.error")
_CONFIGURED = False
_PROVIDER: Any | None = None
_LAST_INIT_ERROR: str | None = None


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
        "headers_configured": bool(str(env.get("OTEL_EXPORTER_OTLP_HEADERS") or "").strip()),
        "service_name": str(env.get("OTEL_SERVICE_NAME") or "chess-studio-backend").strip()[:80],
        "environment": str(env.get("ENVIRONMENT") or "development").strip().lower()[:40],
        "sampler": str(env.get("OTEL_TRACES_SAMPLER") or "parentbased_traceidratio").strip()[:80],
        "sampler_arg": str(env.get("OTEL_TRACES_SAMPLER_ARG") or "0.20").strip()[:32],
    }


def tracing_diagnostics(environ: dict[str, str] | None = None) -> dict[str, Any]:
    """Return safe admin diagnostics without leaking OTLP URLs or credentials."""
    settings = tracing_settings(environ)
    return {
        "configured": bool(_CONFIGURED),
        "enabled": bool(settings["enabled"]),
        "endpointConfigured": bool(settings["endpoint"]),
        "headersConfigured": bool(settings["headers_configured"]),
        "serviceName": settings["service_name"],
        "environment": settings["environment"],
        "sampler": settings["sampler"],
        "samplerArg": settings["sampler_arg"],
        "exporter": "otlp-http",
        "initializationError": _LAST_INIT_ERROR,
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


def emit_trace_probe() -> dict[str, Any]:
    """Emit a deliberately sampled admin probe and flush it toward Tempo.

    With the default ParentBased sampler, a synthetic sampled remote parent makes
    the child probe deterministic even when normal traffic is sampled at 20%.
    No endpoint, auth header or user data is attached to the span.
    """
    diagnostics = tracing_diagnostics()
    if not diagnostics["enabled"] or not _CONFIGURED or _PROVIDER is None:
        return {
            "ok": False,
            "reason": "tracing_not_configured",
            "diagnostics": diagnostics,
        }

    try:
        from opentelemetry import trace
        from opentelemetry.trace import NonRecordingSpan, SpanContext, TraceFlags, TraceState
        from opentelemetry.context import attach, detach

        trace_id = secrets.randbits(128) or 1
        parent_span_id = secrets.randbits(64) or 1
        parent = SpanContext(
            trace_id=trace_id,
            span_id=parent_span_id,
            is_remote=True,
            trace_flags=TraceFlags.SAMPLED,
            trace_state=TraceState(),
        )
        token = attach(trace.set_span_in_context(NonRecordingSpan(parent)))
        try:
            tracer = trace.get_tracer("chess-studio.admin-probe")
            with tracer.start_as_current_span("chess-studio.tempo.probe") as span:
                span.set_attribute("chess_studio.probe", True)
                span.set_attribute("chess_studio.component", "admin")
                context = span.get_span_context()
                sampled = bool(context.trace_flags & TraceFlags.SAMPLED)
                emitted_trace_id = f"{context.trace_id:032x}" if context.is_valid else f"{trace_id:032x}"
        finally:
            detach(token)

        flushed = bool(_PROVIDER.force_flush(timeout_millis=5000))
        return {
            "ok": flushed and sampled,
            "traceId": emitted_trace_id,
            "sampled": sampled,
            "flushed": flushed,
            "serviceName": diagnostics["serviceName"],
        }
    except Exception as exc:
        LOGGER.warning("Tempo trace probe failed open: %s", type(exc).__name__)
        return {
            "ok": False,
            "reason": "probe_failed",
            "errorType": type(exc).__name__,
            "diagnostics": tracing_diagnostics(),
        }


def configure_tracing(app: Any, *, release: str | None = None) -> bool:
    """Instrument FastAPI once. Fail-open by design.

    The OTLP HTTP exporter reads OTEL_EXPORTER_OTLP_HEADERS itself, which keeps
    the Grafana Cloud token out of application code and logs.
    """
    global _CONFIGURED, _PROVIDER, _LAST_INIT_ERROR
    if _CONFIGURED:
        return True

    settings = tracing_settings()
    if not settings["enabled"]:
        _LAST_INIT_ERROR = None
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
        _PROVIDER = provider
        _CONFIGURED = True
        _LAST_INIT_ERROR = None
        LOGGER.info(
            "OpenTelemetry traces enabled for %s (%s, sampler=%s/%s).",
            settings["service_name"], settings["environment"], settings["sampler"], settings["sampler_arg"],
        )
        return True
    except Exception as exc:
        # A bad observability configuration must not make Render fail to boot.
        _PROVIDER = None
        _CONFIGURED = False
        _LAST_INIT_ERROR = type(exc).__name__
        LOGGER.warning("OpenTelemetry tracing unavailable; continuing without traces: %s", type(exc).__name__)
        return False
