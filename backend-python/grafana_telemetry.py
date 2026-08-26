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
from urllib.parse import unquote, urlsplit


logger = logging.getLogger("uvicorn.error")

_tracer: Any = None
_meter_provider: Any = None
_tracer_provider: Any = None
_logger_provider: Any = None
_otlp_logger: Any = None
_http_requests: Any = None
_http_duration: Any = None
_ai_requests: Any = None
_ai_duration: Any = None
_online_users_gauge: Any = None
# Se actualiza desde /api/status. Es una cifra agregada: jamás usuarios,
# sesiones, IPs ni otros identificadores.
_online_users = 0
_state = {"enabled": False, "reason": "not_configured"}


def _env(name: str) -> str:
    return (os.getenv(name) or "").strip()


def _first_env(*names: str) -> str:
    for name in names:
        value = _env(name)
        if value:
            return value
    return ""


def _otlp_signal_endpoint(base: str, signal: str) -> str:
    clean = base.rstrip("/")
    suffix = f"/v1/{signal}"
    return clean if clean.endswith(suffix) else f"{clean}{suffix}"


def _headers_from_portal(value: str) -> dict[str, str]:
    """Convierte el valor copiado de ``OTEL_EXPORTER_OTLP_HEADERS`` a headers."""
    raw = str(value or "").strip()
    headers: dict[str, str] = {}
    for item in raw.split(","):
        key, separator, raw_value = item.partition("=")
        clean_key = key.strip()
        clean_value = unquote(raw_value.strip())
        if separator and clean_key and clean_value:
            headers[clean_key] = clean_value
    # Algunas tarjetas muestran sólo el valor Basic en vez de
    # "Authorization=Basic ...". Aceptarlo evita que el operador tenga que
    # reescribir un secreto que Grafana ya generó.
    decoded_raw = unquote(raw)
    if not headers and decoded_raw.lower().startswith("basic "):
        headers["Authorization"] = decoded_raw
    return headers


def _configuration() -> tuple[str, dict[str, str], bool] | None:
    # Acepta directamente los nombres que muestra Grafana Cloud. Los nombres
    # GRAFANA_* se conservan por compatibilidad con el primer ZIP publicado.
    endpoint = _first_env("OTEL_EXPORTER_OTLP_ENDPOINT", "GRAFANA_OTLP_ENDPOINT")
    portal_headers = _headers_from_portal(_first_env("OTEL_EXPORTER_OTLP_HEADERS", "GRAFANA_OTLP_HEADERS"))
    instance_id = _env("GRAFANA_OTLP_INSTANCE_ID")
    token = _env("GRAFANA_OTLP_TOKEN")
    raw_standard_endpoint = _env("OTEL_EXPORTER_OTLP_ENDPOINT")
    raw_standard_headers = _env("OTEL_EXPORTER_OTLP_HEADERS")
    raw_legacy_endpoint = _env("GRAFANA_OTLP_ENDPOINT")
    raw_legacy_headers = _env("GRAFANA_OTLP_HEADERS")
    if not any((endpoint, portal_headers, instance_id, token)):
        return None
    if endpoint and portal_headers:
        parsed = urlsplit(endpoint)
        if parsed.scheme != "https" or not parsed.netloc:
            logger.warning("grafana_telemetry_disabled reason=invalid_endpoint")
            return None
        # Con las variables estándar dejamos que el exporter oficial construya
        # sus URLs /v1/metrics y /v1/traces y parsee los headers exactamente
        # como especifica OpenTelemetry.
        return endpoint, portal_headers, bool(raw_standard_endpoint and raw_standard_headers)
    # Compatibilidad con el contrato inicial. Hoy recomendamos copiar el
    # valor completo que Grafana muestra como OTEL_EXPORTER_OTLP_HEADERS.
    if not all((endpoint, instance_id, token)):
        logger.warning(
            "grafana_telemetry_disabled reason=incomplete_configuration "
            "standard_endpoint_present=%s standard_headers_present=%s "
            "legacy_endpoint_present=%s legacy_headers_present=%s headers_parsed=%s",
            bool(raw_standard_endpoint),
            bool(raw_standard_headers),
            bool(raw_legacy_endpoint),
            bool(raw_legacy_headers),
            bool(portal_headers),
        )
        return None
    parsed = urlsplit(endpoint)
    if parsed.scheme != "https" or not parsed.netloc:
        logger.warning("grafana_telemetry_disabled reason=invalid_endpoint")
        return None
    encoded = base64.b64encode(f"{instance_id}:{token}".encode("utf-8")).decode("ascii")
    return endpoint, {"Authorization": f"Basic {encoded}"}, False


def configure(*, service_name: str, service_version: str, environment: str) -> bool:
    """Activa exportación OTLP si Render recibió las credenciales completas.

    Un fallo de importación o de configuración nunca puede impedir arrancar ni
    jugar: el proceso conserva las métricas internas y deja una advertencia
    operativa sin incluir secretos.
    """
    global _tracer, _meter_provider, _tracer_provider, _logger_provider, _otlp_logger
    global _http_requests, _http_duration, _ai_requests, _ai_duration
    global _online_users_gauge, _state

    if _state["enabled"]:
        return True
    config = _configuration()
    if config is None:
        _state = {"enabled": False, "reason": "not_configured"}
        return False
    endpoint, headers, use_standard_exporter_environment = config
    try:
        from opentelemetry import _logs, metrics, trace
        from opentelemetry.metrics import Observation
        from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter
        from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.sdk._logs import LoggerProvider
        from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
        from opentelemetry.sdk.metrics import MeterProvider
        from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        resource = Resource.create({
            "service.name": service_name,
            "service.version": service_version[:40],
            "deployment.environment.name": environment[:32],
        })
        if use_standard_exporter_environment:
            metric_exporter = OTLPMetricExporter(timeout=5)
            trace_exporter = OTLPSpanExporter(timeout=5)
        else:
            metric_exporter = OTLPMetricExporter(
                endpoint=_otlp_signal_endpoint(endpoint, "metrics"), headers=headers, timeout=5,
            )
            trace_exporter = OTLPSpanExporter(
                endpoint=_otlp_signal_endpoint(endpoint, "traces"), headers=headers, timeout=5,
            )
        _meter_provider = MeterProvider(
            resource=resource,
            metric_readers=[PeriodicExportingMetricReader(metric_exporter, export_interval_millis=60_000)],
        )
        _tracer_provider = TracerProvider(resource=resource)
        _tracer_provider.add_span_processor(BatchSpanProcessor(
            trace_exporter
        ))
        metrics.set_meter_provider(_meter_provider)
        trace.set_tracer_provider(_tracer_provider)
        meter = metrics.get_meter("chess_studio.telemetry")
        _tracer = trace.get_tracer("chess_studio.telemetry")
        _http_requests = meter.create_counter("chess_studio.http.server.request", unit="1")
        _http_duration = meter.create_histogram("chess_studio.http.server.duration", unit="s")
        _ai_requests = meter.create_counter("chess_studio.ai.request", unit="1")
        _ai_duration = meter.create_histogram("chess_studio.ai.duration", unit="s")

        def observe_online_users(_options):
            return [Observation(max(0, _online_users))]

        _online_users_gauge = meter.create_observable_gauge(
            "chess_studio.presence.online_users",
            callbacks=[observe_online_users],
            unit="1",
            description="Usuarios activos agregados durante la ventana de presencia",
        )
        # Loki recibe únicamente los eventos operativos que emitimos de forma
        # explícita más abajo. No acoplamos un handler al logger global de
        # Uvicorn porque ese flujo conserva usernames y traceback de Render.
        try:
            if use_standard_exporter_environment:
                log_exporter = OTLPLogExporter(timeout=5)
            else:
                log_exporter = OTLPLogExporter(
                    endpoint=_otlp_signal_endpoint(endpoint, "logs"), headers=headers, timeout=5,
                )
            _logger_provider = LoggerProvider(resource=resource)
            _logger_provider.add_log_record_processor(BatchLogRecordProcessor(log_exporter))
            _otlp_logger = _logs.get_logger(
                "chess_studio.operational", logger_provider=_logger_provider,
            )
            logger.info("grafana_logs_enabled source=safe_operational_events")
        except Exception as exc:
            _logger_provider = None
            _otlp_logger = None
            logger.warning("grafana_logs_disabled reason=setup_failed error=%s", type(exc).__name__)
        _state = {"enabled": True, "reason": "configured"}
        logger.info(
            "grafana_telemetry_enabled service=%s configuration=%s",
            service_name,
            "otel_standard_environment" if use_standard_exporter_environment else "legacy_compatibility",
        )
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


def record_http_log(
    *,
    request_id: str,
    method: str,
    route: str,
    status_code: int,
    duration_ms: float,
    client_release: str | None = None,
) -> None:
    """Envía a Loki un evento HTTP deliberadamente sin datos personales.

    El logger local de Render puede conservar ``username`` y traceback para
    depurar una incidencia concreta. Esta copia OTLP es un contrato distinto:
    sólo ruta normalizada, estado, duración, release y un id efímero de
    petición; nunca usuario, IP, cabeceras, cuerpo, FEN ni prompt.
    """
    if not _state["enabled"] or _otlp_logger is None:
        return
    try:
        code = max(0, int(status_code or 0))
        level = "ERROR" if code >= 500 else "WARN" if code >= 400 else "INFO"
        attributes = {
            "event.name": "http_request",
            "request.id": str(request_id or "-")[:80],
            "http.request.method": str(method or "?").upper()[:8],
            "http.route": str(route or "unmatched")[:120],
            "http.response.status_code": code,
            "http.response.status_class": _status_class(code),
            "http.server.duration_ms": round(max(0.0, float(duration_ms or 0.0)), 2),
        }
        if client_release:
            attributes["client.release"] = str(client_release)[:40]
        _otlp_logger.emit(
            severity_text=level,
            body="http_request",
            attributes=attributes,
        )
    except Exception:
        # Loki tampoco puede formar parte del camino crítico de una request.
        pass


def record_online_users(value: int | float | None) -> None:
    """Actualiza la muestra agregada de presencia para el observable gauge.

    El valor procede del contador existente de presencia y se acota para que
    una respuesta anómala de storage no convierta la telemetría en una fuente
    de ruido. También se conserva cuando OTLP está apagado, de forma que una
    activación posterior exporta la siguiente muestra válida.
    """
    global _online_users
    try:
        _online_users = min(1_000_000, max(0, int(value or 0)))
    except (TypeError, ValueError, OverflowError):
        _online_users = 0


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
        if int(status_code or 0) >= 500:
            from opentelemetry.trace import Status, StatusCode

            span.set_status(Status(StatusCode.ERROR))
    except Exception:
        pass


def shutdown() -> None:
    """Vacía el lote al apagar Render, sin retrasar ni bloquear el shutdown."""
    global _state
    for provider in (_logger_provider, _meter_provider, _tracer_provider):
        try:
            if provider is not None:
                provider.shutdown()
        except Exception:
            pass
    _state = {"enabled": False, "reason": "stopped"}
