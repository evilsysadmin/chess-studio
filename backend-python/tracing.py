"""OpenTelemetry export for Chess Studio.

All three signals are optional and fail-open. A single Grafana Cloud OTLP
endpoint can carry traces, metrics and logs; per-signal endpoints may override
it. No endpoint, token or header value is ever returned by diagnostics.
"""
from __future__ import annotations

import json
import logging
import os
import secrets
import threading
from collections import deque
from typing import Any
from urllib.parse import unquote, urlsplit, urlunsplit

LOGGER = logging.getLogger("uvicorn.error")
_CONFIGURED = False
_TRACE_PROVIDER: Any | None = None
_METER_PROVIDER: Any | None = None
_LOGGER_PROVIDER: Any | None = None
_HTTP_COUNTER: Any | None = None
_HTTP_LATENCY: Any | None = None
_FRONTEND_COUNTER: Any | None = None
_FRONTEND_VITAL: Any | None = None
_LAST_INIT_ERROR: str | None = None
_STARTUP_TRACE_ID: str | None = None
_SIGNAL_ERRORS: dict[str, str | None] = {"traces": None, "metrics": None, "logs": None}
_OTEL_LOG_HANDLER: Any | None = None
_TRACE_EXPORT_STATE: dict[str, Any] = {
    "attemptCount": 0,
    "successCount": 0,
    "failureCount": 0,
    "exportedSpanCount": 0,
    "lastResult": None,
    "lastError": None,
    "lastHttpStatus": None,
}
_TRACE_EXPORT_LOCK = threading.Lock()
_TRACE_RECENT_SUCCESS_IDS: deque[str] = deque(maxlen=128)



_SIGNAL_SUFFIX = {"traces": "/v1/traces", "metrics": "/v1/metrics", "logs": "/v1/logs"}

def _resolved_signal_endpoint(env: dict[str, str], signal: str) -> str:
    """Return a full OTLP/HTTP signal URL without exposing or guessing secrets.

    Grafana Cloud documents a generic gateway base (usually ending in /otlp),
    while the Python HTTP exporters send to /v1/<signal>. Normalising here makes
    the transport deterministic and also recovers safely if the generic variable
    was accidentally populated with one signal-specific suffix. Explicit
    per-signal variables remain authoritative and are used verbatim.
    """
    signal = str(signal or "").strip().lower()
    suffix = _SIGNAL_SUFFIX.get(signal)
    if not suffix:
        return ""
    explicit_key = f"OTEL_EXPORTER_OTLP_{signal.upper()}_ENDPOINT"
    explicit = str(env.get(explicit_key) or "").strip()
    if explicit:
        return explicit
    generic = str(env.get("OTEL_EXPORTER_OTLP_ENDPOINT") or "").strip()
    if not generic:
        return ""
    try:
        parts = urlsplit(generic)
        path = (parts.path or "").rstrip("/")
        for known_suffix in _SIGNAL_SUFFIX.values():
            if path.endswith(known_suffix):
                path = path[:-len(known_suffix)].rstrip("/")
                break
        path = f"{path}{suffix}" if path else suffix
        return urlunsplit((parts.scheme, parts.netloc, path, parts.query, parts.fragment))
    except Exception:
        return generic.rstrip("/") + suffix

def _safe_endpoint_path(endpoint: str) -> str | None:
    if not endpoint:
        return None
    try:
        return urlsplit(endpoint).path or "/"
    except Exception:
        return None

def _parse_otlp_headers(value: str | None) -> dict[str, str]:
    """Parse OTEL_EXPORTER_OTLP_HEADERS once and pass it explicitly to exporters.

    Values may be percent-encoded per the OTLP environment-variable format.
    Diagnostics expose only whether headers exist, never their values.
    """
    headers: dict[str, str] = {}
    for chunk in str(value or "").split(","):
        chunk = chunk.strip()
        if not chunk or "=" not in chunk:
            continue
        key, raw = chunk.split("=", 1)
        key = unquote(key.strip())
        if not key:
            continue
        headers[key] = unquote(raw.strip())
    return headers


def _truthy(value: str | None) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def _enabled(explicit: str | None, endpoint: str) -> bool:
    raw = str(explicit or "").strip()
    if raw and not _truthy(raw):
        return False
    # "enabled=true" sin endpoint era engañoso: el SDK quedaba marcado como
    # activo aunque no hubiera ningún destino al que exportar.
    return bool(endpoint)


def tracing_settings(environ: dict[str, str] | None = None) -> dict[str, Any]:
    env = os.environ if environ is None else environ
    generic = str(env.get("OTEL_EXPORTER_OTLP_ENDPOINT") or "").strip()
    traces_endpoint = _resolved_signal_endpoint(env, "traces")
    metrics_endpoint = _resolved_signal_endpoint(env, "metrics")
    logs_endpoint = _resolved_signal_endpoint(env, "logs")
    return {
        "enabled": _enabled(env.get("OTEL_TRACES_ENABLED"), traces_endpoint),
        "endpoint": traces_endpoint,
        "trace_endpoint": traces_endpoint,
        "metrics_endpoint": metrics_endpoint,
        "logs_endpoint": logs_endpoint,
        "traces_enabled": _enabled(env.get("OTEL_TRACES_ENABLED"), traces_endpoint),
        "metrics_enabled": _enabled(env.get("OTEL_METRICS_ENABLED"), metrics_endpoint),
        "logs_enabled": _enabled(env.get("OTEL_LOGS_ENABLED"), logs_endpoint),
        "generic_endpoint_configured": bool(generic),
        "traces_endpoint_configured": bool(traces_endpoint),
        "metrics_endpoint_configured": bool(metrics_endpoint),
        "logs_endpoint_configured": bool(logs_endpoint),
        "headers_configured": bool(str(env.get("OTEL_EXPORTER_OTLP_HEADERS") or "").strip()),
        "service_name": str(env.get("OTEL_SERVICE_NAME") or "chess-studio-backend").strip()[:80],
        "environment": str(env.get("ENVIRONMENT") or "development").strip().lower()[:40],
        "sampler": str(env.get("OTEL_TRACES_SAMPLER") or "parentbased_traceidratio").strip()[:80],
        "sampler_arg": str(env.get("OTEL_TRACES_SAMPLER_ARG") or "0.20").strip()[:32],
        "protocol": str(env.get("OTEL_EXPORTER_OTLP_PROTOCOL") or "http/protobuf").strip().lower()[:40],
    }


def tracing_diagnostics(environ: dict[str, str] | None = None) -> dict[str, Any]:
    settings = tracing_settings(environ)
    signals = {
        "traces": {
            "enabled": bool(settings["traces_enabled"]),
            "endpointConfigured": bool(settings["traces_endpoint_configured"]),
            "configured": _TRACE_PROVIDER is not None,
            "endpointPath": _safe_endpoint_path(settings["trace_endpoint"]),
            "error": _SIGNAL_ERRORS["traces"],
        },
        "metrics": {
            "enabled": bool(settings["metrics_enabled"]),
            "endpointConfigured": bool(settings["metrics_endpoint_configured"]),
            "configured": _METER_PROVIDER is not None,
            "endpointPath": _safe_endpoint_path(settings["metrics_endpoint"]),
            "error": _SIGNAL_ERRORS["metrics"],
        },
        "logs": {
            "enabled": bool(settings["logs_enabled"]),
            "endpointConfigured": bool(settings["logs_endpoint_configured"]),
            "configured": _LOGGER_PROVIDER is not None,
            "endpointPath": _safe_endpoint_path(settings["logs_endpoint"]),
            "error": _SIGNAL_ERRORS["logs"],
        },
    }
    return {
        "configured": bool(_CONFIGURED),
        "enabled": bool(settings["traces_enabled"]),
        "endpointConfigured": bool(settings["traces_endpoint_configured"]),
        "headersConfigured": bool(settings["headers_configured"]),
        "serviceName": settings["service_name"],
        "environment": settings["environment"],
        "sampler": settings["sampler"],
        "samplerArg": settings["sampler_arg"],
        "protocol": settings["protocol"],
        "providerBinding": "explicit" if _TRACE_PROVIDER is not None else "none",
        "exporter": "otlp-http",
        "traceExporter": _trace_export_snapshot(),
        "startupTraceId": _STARTUP_TRACE_ID,
        "initializationError": _LAST_INIT_ERROR,
        "signals": signals,
    }


def _trace_export_snapshot() -> dict[str, Any]:
    with _TRACE_EXPORT_LOCK:
        return dict(_TRACE_EXPORT_STATE)


def _trace_export_error(http_status: int | None, result_name: str | None = None) -> str | None:
    if result_name == "SUCCESS":
        return None
    if http_status:
        return f"http_{int(http_status)}"
    return "export_failed" if result_name else None


def current_trace_id() -> str | None:
    try:
        from opentelemetry import trace
        span = trace.get_current_span()
        context = span.get_span_context()
        if context and context.is_valid:
            return f"{context.trace_id:032x}"
    except Exception:
        pass
    return None


def current_trace_sampled() -> bool | None:
    try:
        from opentelemetry import trace
        from opentelemetry.trace import TraceFlags
        context = trace.get_current_span().get_span_context()
        if context and context.is_valid:
            return bool(context.trace_flags & TraceFlags.SAMPLED)
    except Exception:
        pass
    return None


def record_http_otel(method: str, route: str, status_code: int, duration_ms: float, *, client_release: str | None = None) -> None:
    """Record low-cardinality request metrics. Never raises into product code."""
    try:
        if _HTTP_COUNTER is None or _HTTP_LATENCY is None:
            return
        status = int(status_code or 0)
        attrs = {
            "http.request.method": str(method or "?").upper()[:8],
            "http.route": str(route or "unknown")[:120],
            "http.response.status_class": f"{status // 100}xx" if status > 0 else "unknown",
        }
        release = str(client_release or "").strip()[:40]
        if release:
            attrs["service.client_release"] = release
        _HTTP_COUNTER.add(1, attrs)
        _HTTP_LATENCY.record(max(0.0, float(duration_ms or 0.0)) / 1000.0, attrs)
    except Exception:
        pass


def record_frontend_otel(event_type: str, *, metric_name: str | None = None, value: float | None = None, context: str | None = None, release: str | None = None) -> None:
    """Record coarse frontend telemetry without identity or free-form values."""
    try:
        if _FRONTEND_COUNTER is None:
            return
        attrs = {
            "event.type": str(event_type or "unknown")[:40],
            "frontend.context": str(context or "unknown")[:40],
        }
        clean_release = str(release or "").strip()[:40]
        if clean_release:
            attrs["service.client_release"] = clean_release
        if metric_name:
            attrs["web_vital.name"] = str(metric_name)[:20]
        _FRONTEND_COUNTER.add(1, attrs)
        if metric_name and value is not None and _FRONTEND_VITAL is not None:
            _FRONTEND_VITAL.record(float(value), attrs)
    except Exception:
        pass


def _force_flush(provider: Any | None, timeout_ms: int = 5000) -> bool:
    if provider is None:
        return False
    try:
        result = provider.force_flush(timeout_millis=timeout_ms)
        return True if result is None else bool(result)
    except TypeError:
        try:
            result = provider.force_flush()
            return True if result is None else bool(result)
        except Exception:
            return False
    except Exception:
        return False


def emit_trace_probe() -> dict[str, Any]:
    diagnostics = tracing_diagnostics()
    if not diagnostics["signals"]["traces"]["configured"] or _TRACE_PROVIDER is None:
        return {"ok": False, "reason": "tracing_not_configured", "diagnostics": diagnostics}
    try:
        from opentelemetry import trace
        from opentelemetry.trace import NonRecordingSpan, SpanContext, TraceFlags, TraceState
        from opentelemetry.context import attach, detach

        # Capture the success counter BEFORE creating the probe span. Batch export can
        # run immediately on another thread; taking the baseline afterwards creates a
        # race that incorrectly reports a successful export as missing.
        before = _trace_export_snapshot()
        before_successes = int(before.get("successCount") or 0)
        before_spans = int(before.get("exportedSpanCount") or 0)

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
            tracer = _TRACE_PROVIDER.get_tracer("chess-studio.admin-probe")
            with tracer.start_as_current_span("chess-studio.tempo.probe") as span:
                span.set_attribute("chess_studio.probe", True)
                span.set_attribute("chess_studio.component", "admin")
                context = span.get_span_context()
                sampled = bool(context.trace_flags & TraceFlags.SAMPLED)
                emitted_trace_id = f"{context.trace_id:032x}" if context.is_valid else f"{trace_id:032x}"
        finally:
            detach(token)

        flushed = _force_flush(_TRACE_PROVIDER)
        state = _trace_export_snapshot()
        with _TRACE_EXPORT_LOCK:
            exact_trace_exported = emitted_trace_id in _TRACE_RECENT_SUCCESS_IDS
        exported = (
            exact_trace_exported
            and int(state.get("successCount") or 0) > before_successes
            and int(state.get("exportedSpanCount") or 0) > before_spans
        )
        exporter_ok = state.get("lastResult") == "SUCCESS"
        return {
            "ok": bool(flushed and sampled and exported and exporter_ok),
            "traceId": emitted_trace_id,
            "sampled": sampled,
            "flushed": flushed,
            "exported": exported,
            "exportResult": state.get("lastResult"),
            "exportError": state.get("lastError"),
            "httpStatus": state.get("lastHttpStatus"),
            "serviceName": diagnostics["serviceName"],
        }
    except Exception as exc:
        LOGGER.warning("Tempo trace probe failed open: %s", type(exc).__name__)
        return {"ok": False, "reason": "probe_failed", "errorType": type(exc).__name__, "diagnostics": tracing_diagnostics()}


def emit_observability_probe() -> dict[str, Any]:
    """Emit one log, one metric and one sampled trace; return only safe status."""
    trace_result = emit_trace_probe()
    record_http_otel("PROBE", "/internal/observability-probe", 200, 1.0, client_release="probe")
    probe_body = {"event": "observability_probe", "component": "admin", "trace_id": trace_result.get("traceId")}
    LOGGER.info(json.dumps(probe_body, separators=(",", ":"), sort_keys=True))
    metrics_flushed = _force_flush(_METER_PROVIDER)
    logs_flushed = _force_flush(_LOGGER_PROVIDER)
    diagnostics = tracing_diagnostics()
    return {
        "ok": bool(trace_result.get("ok") and metrics_flushed and logs_flushed),
        "traceId": trace_result.get("traceId"),
        "signals": {
            "traces": {
                "configured": diagnostics["signals"]["traces"]["configured"],
                "flushed": bool(trace_result.get("flushed")),
                "exported": bool(trace_result.get("exported")),
                "ok": bool(trace_result.get("ok")),
                "exportResult": trace_result.get("exportResult"),
                "exportError": trace_result.get("exportError"),
                "httpStatus": trace_result.get("httpStatus"),
            },
            "metrics": {"configured": diagnostics["signals"]["metrics"]["configured"], "flushed": metrics_flushed},
            "logs": {"configured": diagnostics["signals"]["logs"]["configured"], "flushed": logs_flushed},
        },
        "diagnostics": diagnostics,
    }


def configure_tracing(app: Any, *, release: str | None = None) -> bool:
    """Configure OTLP traces, metrics and logs once; fail-open per signal."""
    global _CONFIGURED, _TRACE_PROVIDER, _METER_PROVIDER, _LOGGER_PROVIDER
    global _HTTP_COUNTER, _HTTP_LATENCY, _FRONTEND_COUNTER, _FRONTEND_VITAL
    global _LAST_INIT_ERROR, _OTEL_LOG_HANDLER, _STARTUP_TRACE_ID
    if _CONFIGURED:
        return True

    settings = tracing_settings()
    exporter_headers = _parse_otlp_headers(os.environ.get("OTEL_EXPORTER_OTLP_HEADERS"))
    if not any((settings["traces_enabled"], settings["metrics_enabled"], settings["logs_enabled"])):
        _LAST_INIT_ERROR = None
        LOGGER.info("OpenTelemetry disabled: no OTLP endpoint configured.")
        return False

    attributes = {
        "service.name": settings["service_name"],
        "deployment.environment.name": settings["environment"],
    }
    if release:
        attributes["service.version"] = str(release)[:80]

    try:
        from opentelemetry.sdk.resources import Resource
        resource = Resource.create(attributes)
    except Exception as exc:
        _LAST_INIT_ERROR = type(exc).__name__
        LOGGER.warning("OpenTelemetry SDK unavailable; continuing without export: %s", type(exc).__name__)
        return False

    # Traces
    if settings["traces_enabled"]:
        try:
            os.environ.setdefault("OTEL_TRACES_SAMPLER", settings["sampler"])
            os.environ.setdefault("OTEL_TRACES_SAMPLER_ARG", settings["sampler_arg"])
            os.environ.setdefault("OTEL_SERVICE_NAME", settings["service_name"])
            from opentelemetry import trace
            from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
            from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
            from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
            from opentelemetry.sdk.trace import TracerProvider
            from opentelemetry.sdk.trace.export import BatchSpanProcessor
            provider = TracerProvider(resource=resource)

            class TrackingOTLPSpanExporter(OTLPSpanExporter):
                """OTLP exporter that exposes only safe delivery diagnostics.

                `force_flush()` only means that the batch queue was drained; it does
                NOT prove Grafana accepted the HTTP request. Capturing the actual
                exporter result/status prevents Admin from reporting a false positive.
                """

                def _export(self, serialized_data, timeout_sec=None):
                    try:
                        response = super()._export(serialized_data, timeout_sec)
                    except Exception as exc:
                        with _TRACE_EXPORT_LOCK:
                            _TRACE_EXPORT_STATE["lastHttpStatus"] = None
                            _TRACE_EXPORT_STATE["lastError"] = type(exc).__name__
                        raise
                    status = getattr(response, "status_code", None)
                    with _TRACE_EXPORT_LOCK:
                        _TRACE_EXPORT_STATE["lastHttpStatus"] = int(status) if status is not None else None
                    return response

                def export(self, spans):
                    with _TRACE_EXPORT_LOCK:
                        _TRACE_EXPORT_STATE["attemptCount"] = int(_TRACE_EXPORT_STATE.get("attemptCount") or 0) + 1
                    try:
                        result = super().export(spans)
                    except Exception as exc:
                        with _TRACE_EXPORT_LOCK:
                            _TRACE_EXPORT_STATE["failureCount"] = int(_TRACE_EXPORT_STATE.get("failureCount") or 0) + 1
                            _TRACE_EXPORT_STATE["lastResult"] = "EXCEPTION"
                            _TRACE_EXPORT_STATE["lastError"] = type(exc).__name__
                        raise

                    result_name = getattr(result, "name", str(result))
                    with _TRACE_EXPORT_LOCK:
                        _TRACE_EXPORT_STATE["lastResult"] = result_name
                        status = _TRACE_EXPORT_STATE.get("lastHttpStatus")
                        if result_name == "SUCCESS":
                            _TRACE_EXPORT_STATE["successCount"] = int(_TRACE_EXPORT_STATE.get("successCount") or 0) + 1
                            _TRACE_EXPORT_STATE["exportedSpanCount"] = int(_TRACE_EXPORT_STATE.get("exportedSpanCount") or 0) + len(spans)
                            for readable_span in spans:
                                context = getattr(readable_span, "context", None)
                                trace_id = getattr(context, "trace_id", 0)
                                if trace_id:
                                    _TRACE_RECENT_SUCCESS_IDS.append(f"{int(trace_id):032x}")
                            _TRACE_EXPORT_STATE["lastError"] = None
                        else:
                            _TRACE_EXPORT_STATE["failureCount"] = int(_TRACE_EXPORT_STATE.get("failureCount") or 0) + 1
                            existing_error = _TRACE_EXPORT_STATE.get("lastError")
                            _TRACE_EXPORT_STATE["lastError"] = _trace_export_error(status, result_name) if status else (existing_error or "export_failed")
                    return result

            provider.add_span_processor(BatchSpanProcessor(TrackingOTLPSpanExporter(endpoint=settings["trace_endpoint"], headers=exporter_headers or None)))
            # Bind instrumentation explicitly to Chess Studio's provider.  A hosting
            # layer or another library may already have installed a global provider;
            # trace.set_tracer_provider() deliberately refuses to replace it.  Without
            # the explicit provider FastAPI can therefore create perfectly valid
            # trace_ids that never reach our OTLP exporter.
            trace.set_tracer_provider(provider)
            FastAPIInstrumentor.instrument_app(app, tracer_provider=provider)
            HTTPXClientInstrumentor().instrument(tracer_provider=provider)
            _TRACE_PROVIDER = provider
            # One non-blocking span per process gives Tempo a deterministic proof
            # of life after every deploy. BatchSpanProcessor exports it normally;
            # startup never waits on the network.
            startup_tracer = provider.get_tracer("chess-studio.startup")
            with startup_tracer.start_as_current_span("chess-studio.startup") as startup_span:
                startup_span.set_attribute("chess_studio.startup", True)
                context = startup_span.get_span_context()
                if context and context.is_valid:
                    _STARTUP_TRACE_ID = f"{context.trace_id:032x}"
            _SIGNAL_ERRORS["traces"] = None
        except Exception as exc:
            _SIGNAL_ERRORS["traces"] = type(exc).__name__
            LOGGER.warning("OpenTelemetry traces unavailable; continuing: %s", type(exc).__name__)

    # Metrics
    if settings["metrics_enabled"]:
        try:
            from opentelemetry import metrics
            from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
            from opentelemetry.sdk.metrics import MeterProvider
            from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
            reader = PeriodicExportingMetricReader(OTLPMetricExporter(endpoint=settings["metrics_endpoint"], headers=exporter_headers or None), export_interval_millis=30000)
            meter_provider = MeterProvider(resource=resource, metric_readers=[reader])
            metrics.set_meter_provider(meter_provider)
            meter = metrics.get_meter("chess-studio.backend")
            _HTTP_COUNTER = meter.create_counter("chess_studio_http_server_requests", description="Chess Studio HTTP requests")
            _HTTP_LATENCY = meter.create_histogram("chess_studio_http_server_duration", unit="s", description="Chess Studio HTTP request duration")
            _FRONTEND_COUNTER = meter.create_counter("chess_studio_frontend_events", description="Coarse frontend telemetry events")
            _FRONTEND_VITAL = meter.create_histogram("chess_studio_frontend_web_vital", description="Web Vital value reported by the frontend")
            _METER_PROVIDER = meter_provider
            _SIGNAL_ERRORS["metrics"] = None
        except Exception as exc:
            _SIGNAL_ERRORS["metrics"] = type(exc).__name__
            LOGGER.warning("OpenTelemetry metrics unavailable; continuing: %s", type(exc).__name__)

    # Logs. Attach only to uvicorn.error, where Chess Studio emits structured
    # operational events; avoid exporting every library debug line.
    if settings["logs_enabled"]:
        try:
            from opentelemetry._logs import set_logger_provider
            from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter
            from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
            from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
            logger_provider = LoggerProvider(resource=resource)
            logger_provider.add_log_record_processor(BatchLogRecordProcessor(OTLPLogExporter(endpoint=settings["logs_endpoint"], headers=exporter_headers or None)))
            set_logger_provider(logger_provider)
            handler = LoggingHandler(level=logging.INFO, logger_provider=logger_provider)
            handler._chess_studio_otel = True  # type: ignore[attr-defined]
            target = logging.getLogger("uvicorn.error")
            if not any(getattr(existing, "_chess_studio_otel", False) for existing in target.handlers):
                target.addHandler(handler)
            _OTEL_LOG_HANDLER = handler
            _LOGGER_PROVIDER = logger_provider
            _SIGNAL_ERRORS["logs"] = None
        except Exception as exc:
            _SIGNAL_ERRORS["logs"] = type(exc).__name__
            LOGGER.warning("OpenTelemetry logs unavailable; continuing: %s", type(exc).__name__)

    _CONFIGURED = any((_TRACE_PROVIDER is not None, _METER_PROVIDER is not None, _LOGGER_PROVIDER is not None))
    _LAST_INIT_ERROR = None if _CONFIGURED else next((error for error in _SIGNAL_ERRORS.values() if error), "not_configured")
    LOGGER.info(
        "OpenTelemetry signals: traces=%s metrics=%s logs=%s service=%s env=%s trace_provider=explicit protocol=%s paths=%s/%s/%s.",
        _TRACE_PROVIDER is not None, _METER_PROVIDER is not None, _LOGGER_PROVIDER is not None,
        settings["service_name"], settings["environment"], settings["protocol"],
        _safe_endpoint_path(settings["trace_endpoint"]), _safe_endpoint_path(settings["metrics_endpoint"]), _safe_endpoint_path(settings["logs_endpoint"]),
    )
    return _CONFIGURED
