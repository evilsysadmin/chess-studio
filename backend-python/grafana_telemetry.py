"""Salida OTLP opcional para Grafana Cloud.

No sustituye la observabilidad propia de Chess Studio: la amplía cuando el
operador configura Grafana en el entorno. No guarda ni exporta identidades,
IPs, FENs, cuerpos, prompts, ni cabeceras de las requests.
"""
from __future__ import annotations

import base64
import logging
import os
from contextlib import nullcontext
from typing import Any
from urllib.parse import urlsplit


logger = logging.getLogger("uvicorn.error")

_tracer: Any = None
_meter_provider: Any = None
_tracer_provider: Any = None
_http_requests: Any = None
_http_duration: Any = None
_ai_requests: Any = None
_ai_duration: Any = None
_state = {"enabled": False, "reason": "not_configured"}


def _env(name: str) -> str:
    return (os.getenv(name) or "").strip()


def _otlp_signal_endpoint(base: str, signal: str) -> str:
    clean = base.rstrip("/")
    suffix = f"/v1/{signal}"
    return clean if clean.endswith(suffix) else f"{clean}{suffix}"


def _configuration() -> tuple[str, str, str] | None:
    endpoint = _env("GRAFANA_OTLP_ENDPOINT")
    instance_id = _env("GRAFANA_OTLP_INSTANCE_ID")
    token = _env("GRAFANA_OTLP_TOKEN")
    if not any((endpoint, instance_id, token)):
        return None
    if not all((endpoint, instance_id, token)):
        logger.warning("grafana_telemetry_disabled reason=incomplete_configuration")
        return None
    parsed = urlsplit(endpoint)
    if parsed.scheme != "https" or not parsed.netloc:
        logger.warning("grafana_telemetry_disabled reason=invalid_endpoint")
        return None
    return endpoint, instance_id, token


def configure(*, service_name: str, service_version: str, environment: str) -> bool:
    """Activa exportación OTLP si Render recibió las credenciales completas.

    Un fallo de importación o de configuración nunca puede impedir arrancar ni
    jugar: el proceso conserva las métricas internas y deja una advertencia
    operativa sin incluir secretos.
    """
    global _tracer, _meter_provider, _tracer_provider
    global _http_requests, _http_duration, _ai_requests, _ai_duration, _state

    if _state["enabled"]:
        return True
    config = _configuration()
    if config is None:
        _state = {"enabled": False, "reason": "not_configured"}
        return False
    endpoint, instance_id, token = config
    try:
        from opentelemetry import metrics, trace
        from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.sdk.metrics import MeterProvider
        from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        encoded = base64.b64encode(f"{instance_id}:{token}".encode("utf-8")).decode("ascii")
        headers = {"Authorization": f"Basic {encoded}"}
        resource = Resource.create({
            "service.name": service_name,
            "service.version": service_version[:40],
            "deployment.environment.name": environment[:32],
        })
        metric_exporter = OTLPMetricExporter(
            endpoint=_otlp_signal_endpoint(endpoint, "metrics"), headers=headers, timeout=5,
        )
        _meter_provider = MeterProvider(
            resource=resource,
            metric_readers=[PeriodicExportingMetricReader(metric_exporter, export_interval_millis=60_000)],
        )
        _tracer_provider = TracerProvider(resource=resource)
        _tracer_provider.add_span_processor(BatchSpanProcessor(
            OTLPSpanExporter(endpoint=_otlp_signal_endpoint(endpoint, "traces"), headers=headers, timeout=5)
        ))
        metrics.set_meter_provider(_meter_provider)
        trace.set_tracer_provider(_tracer_provider)
        meter = metrics.get_meter("chess_studio.telemetry")
        _tracer = trace.get_tracer("chess_studio.telemetry")
        _http_requests = meter.create_counter("chess_studio.http.server.request", unit="1")
        _http_duration = meter.create_histogram("chess_studio.http.server.duration", unit="s")
        _ai_requests = meter.create_counter("chess_studio.ai.request", unit="1")
        _ai_duration = meter.create_histogram("chess_studio.ai.duration", unit="s")
        _state = {"enabled": True, "reason": "configured"}
        logger.info("grafana_telemetry_enabled service=%s", service_name)
        return True
    except Exception as exc:
        _state = {"enabled": False, "reason": "setup_failed"}
        logger.warning("grafana_telemetry_disabled reason=setup_failed error=%s", type(exc).__name__)
        return False


def status() -> dict[str, Any]:
    """Estado seguro para diagnósticos: nunca expone URL, instancia ni token."""
    return dict(_state)


def _status_class(status_code: int) -> str:
    status = max(0, int(status_code or 0))
    return f"{status // 100}xx" if 100 <= status <= 599 else "unknown"


def record_http_request(method: str, route: str, status_code: int, duration_seconds: float) -> None:
    if not _state["enabled"] or _http_requests is None or _http_duration is None:
        return
    try:
        attributes = {
            "http.request.method": str(method or "?").upper()[:8],
            "http.route": str(route or "unmatched")[:120],
            "http.response.status_class": _status_class(status_code),
        }
        _http_requests.add(1, attributes)
        _http_duration.record(max(0.0, float(duration_seconds or 0.0)), attributes)
    except Exception:
        # La red o el exporter no son parte del camino crítico de juego.
        pass


def record_ai_request(provider: str, channel: str, duration_seconds: float) -> None:
    if not _state["enabled"] or _ai_requests is None or _ai_duration is None:
        return
    try:
        attributes = {
            "ai.provider": str(provider or "unknown")[:24],
            "ai.channel": str(channel or "generic")[:32],
        }
        _ai_requests.add(1, attributes)
        _ai_duration.record(max(0.0, float(duration_seconds or 0.0)), attributes)
    except Exception:
        pass


def start_http_span(method: str):
    """Context manager de span; uno nulo cuando Grafana no está configurado."""
    if not _state["enabled"] or _tracer is None:
        return nullcontext(None)
    try:
        return _tracer.start_as_current_span(f"{str(method or 'HTTP').upper()} request")
    except Exception:
        return nullcontext(None)


def annotate_http_span(span: Any, *, method: str, route: str, status_code: int) -> None:
    if span is None:
        return
    try:
        span.set_attribute("http.request.method", str(method or "?").upper()[:8])
        span.set_attribute("http.route", str(route or "unmatched")[:120])
        span.set_attribute("http.response.status_code", int(status_code or 0))
    except Exception:
        pass


def shutdown() -> None:
    """Vacía el lote al apagar Render, sin retrasar ni bloquear el shutdown."""
    global _state
    for provider in (_meter_provider, _tracer_provider):
        try:
            if provider is not None:
                provider.shutdown()
        except Exception:
            pass
    _state = {"enabled": False, "reason": "stopped"}
