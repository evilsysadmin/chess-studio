import { useEffect, useMemo, useRef, useState } from 'react';
import { burnRateForSlo, errorBudgetForSlo, evaluateProductSlos, evaluateReleaseHealth, fetchAdminObservability, observabilityRangeForPreset, runObservabilityProbe, runTempoTraceProbe, summarizeObservabilityHealth } from '../observability.js';
import { APP_RELEASE } from '../release.js';

function metric(value, suffix = '') {
  return value == null || Number.isNaN(Number(value)) ? '—' : `${Number(value).toLocaleString('es-ES')}${suffix}`;
}


function tempoProbeFailure(probe) {
  const status = Number(probe?.httpStatus);
  if (status === 401 || status === 403) return `HTTP ${status} · credenciales OTLP rechazadas`;
  if (status === 404) return 'HTTP 404 · endpoint OTLP incorrecto';
  if (status === 429) return 'HTTP 429 · límite/cuota de ingesta';
  if (status >= 500) return `HTTP ${status} · gateway OTLP no disponible`;
  if (status > 0) return `HTTP ${status} · exportación rechazada`;
  if (probe?.exportError) return String(probe.exportError);
  return probe?.exportResult || probe?.reason || 'exportación OTLP no confirmada';
}

function operationalVerdict({ loading, summary, slo, burnRate, runtime }) {
  if (loading) return { level: 'unknown', label: 'COMPROBANDO', message: 'Midiendo la salud operativa…' };
  if (summary.status === 'unknown') return { level: 'unknown', label: 'SIN DATOS', message: 'No hay muestra suficiente para afirmar que todo está bien.' };
  if (summary.databaseLabel === 'Mongo DOWN') return { level: 'critical', label: 'PROBLEMAS', message: 'Mongo no responde. Revisa Grafana y el backend antes de seguir.' };
  const criticalDependency = (runtime?.dependencies || []).find((row) => row?.critical && row?.status === 'down');
  if (criticalDependency) return { level: 'critical', label: 'PROBLEMAS', message: `${criticalDependency.label || 'Una dependencia crítica'} no responde.` };
  if (runtime?.resilience?.level === 'critical') return { level: 'critical', label: 'PROBLEMAS', message: 'El backend está protegiendo capacidad mediante degradación o load shedding.' };
  if (summary.status === 'degraded' || slo.status === 'missed' || burnRate.status === 'fast') {
    const signals = [];
    if (Number(summary.error5xxPercent) > 0) signals.push(`${metric(summary.error5xxPercent, '%')} de 5xx`);
    if (slo.status === 'missed' && Number.isFinite(Number(summary.apiP95Ms))) signals.push(`p95 ${metric(summary.apiP95Ms, ' ms')}`);
    if (burnRate.status === 'fast') signals.push('error budget quemándose rápido');
    return { level: 'critical', label: 'PROBLEMAS', message: signals.length ? `Señales activas: ${signals.join(' · ')}.` : 'Hay señales operativas degradadas.' };
  }
  if (burnRate.status === 'watch' || runtime?.resilience?.level === 'degraded') return { level: 'warn', label: 'VIGILAR', message: 'El servicio responde, pero hay presión operativa que merece seguimiento.' };
  return { level: 'ok', label: 'HEALTH OK', message: 'API y persistencia responden con normalidad en la muestra disponible.' };
}

export default function AdminObservabilitySummary({ token, users = [], currentAdmin = null, onOpen }) {
  const [runtime, setRuntime] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tempoProbe, setTempoProbe] = useState(null);
  const [signalProbe, setSignalProbe] = useState(null);
  const [tempoProbeBusy, setTempoProbeBusy] = useState(false);
  const [signalProbeBusy, setSignalProbeBusy] = useState(false);
  const mountedRef = useRef(true);
  const tempoProbeInFlightRef = useRef(false);
  const signalProbeInFlightRef = useRef(false);
  const tempoProbeAbortRef = useRef(null);
  const signalProbeAbortRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      tempoProbeAbortRef.current?.abort('Observabilidad cerrada');
      signalProbeAbortRef.current?.abort('Observabilidad cerrada');
      tempoProbeInFlightRef.current = false;
      signalProbeInFlightRef.current = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const range = observabilityRangeForPreset('24h');
    setLoading(true);
    fetchAdminObservability({ token, from: range.from, to: range.to, signal: controller.signal })
      .then((payload) => { if (!controller.signal.aborted && mountedRef.current) setRuntime(payload); })
      .catch(() => { if (!controller.signal.aborted && mountedRef.current) setRuntime(null); })
      .finally(() => { if (!controller.signal.aborted && mountedRef.current) setLoading(false); });
    return () => controller.abort('Resumen de observabilidad reemplazado');
  }, [token]);

  const summary = useMemo(() => summarizeObservabilityHealth(runtime, users, currentAdmin), [runtime, users, currentAdmin]);
  const slo = useMemo(() => evaluateProductSlos(runtime), [runtime]);
  const errorBudget = useMemo(() => errorBudgetForSlo(runtime), [runtime]);
  const burnRate = useMemo(() => burnRateForSlo(runtime), [runtime]);
  const releaseHealth = useMemo(() => evaluateReleaseHealth(runtime, APP_RELEASE), [runtime]);
  const verdict = operationalVerdict({ loading, summary, slo, burnRate, runtime });
  const grafanaUrl = String(import.meta.env.VITE_GRAFANA_CLOUD_URL || 'https://grafana.com/').trim();
  const grafanaHealthUrl = String(import.meta.env.VITE_GRAFANA_HEALTH_DASHBOARD_URL || '').trim();
  const grafanaLogsUrl = String(import.meta.env.VITE_GRAFANA_LOGS_DASHBOARD_URL || '').trim();
  const grafanaTracesUrl = String(import.meta.env.VITE_GRAFANA_TRACES_DASHBOARD_URL || '').trim();
  const tracing = runtime?.tracing || null;

  async function handleTempoProbe() {
    if (tempoProbeInFlightRef.current) return;
    tempoProbeInFlightRef.current = true;
    const controller = new AbortController();
    tempoProbeAbortRef.current?.abort('Nueva comprobación de trazas');
    tempoProbeAbortRef.current = controller;
    setTempoProbeBusy(true);
    try {
      const result = await runTempoTraceProbe({ token, signal: controller.signal });
      if (!controller.signal.aborted && mountedRef.current) setTempoProbe(result);
    } catch (error) {
      if (!controller.signal.aborted && mountedRef.current) setTempoProbe({ ok: false, reason: error?.message || 'La comprobación de trazas falló.' });
    } finally {
      if (tempoProbeAbortRef.current === controller) tempoProbeAbortRef.current = null;
      tempoProbeInFlightRef.current = false;
      if (mountedRef.current) setTempoProbeBusy(false);
    }
  }

  async function handleSignalProbe() {
    if (signalProbeInFlightRef.current) return;
    signalProbeInFlightRef.current = true;
    const controller = new AbortController();
    signalProbeAbortRef.current?.abort('Nueva comprobación de señales');
    signalProbeAbortRef.current = controller;
    setSignalProbeBusy(true);
    try {
      const result = await runObservabilityProbe({ token, signal: controller.signal });
      if (!controller.signal.aborted && mountedRef.current) setSignalProbe(result);
    } catch (error) {
      if (!controller.signal.aborted && mountedRef.current) setSignalProbe({ ok: false, reason: error?.message || 'La comprobación de señales falló.', signals: {} });
    } finally {
      if (signalProbeAbortRef.current === controller) signalProbeAbortRef.current = null;
      signalProbeInFlightRef.current = false;
      if (mountedRef.current) setSignalProbeBusy(false);
    }
  }

  return (
    <section className={`admin-operational-status is-${verdict.level}`} aria-label="Estado operativo de Chess Studio">
      <div className="admin-operational-status-main">
        <div>
          <span className="section-label">Estado operativo</span>
          <h3>{verdict.label}</h3>
          <p>{verdict.message}</p>
        </div>
        <span className="admin-operational-status-dot" aria-hidden="true" />
      </div>

      <div className="admin-operational-actions">
        <a className="primary-btn admin-grafana-link" href={grafanaUrl} target="_blank" rel="noreferrer">Abrir Grafana Cloud ↗</a>
        {(grafanaHealthUrl || grafanaLogsUrl || grafanaTracesUrl) ? (
          <nav className="admin-grafana-shortcuts" aria-label="Dashboards de Grafana">
            {grafanaHealthUrl ? <a href={grafanaHealthUrl} target="_blank" rel="noreferrer">Salud ↗</a> : null}
            {grafanaLogsUrl ? <a href={grafanaLogsUrl} target="_blank" rel="noreferrer">Logs ↗</a> : null}
            {grafanaTracesUrl ? <a href={grafanaTracesUrl} target="_blank" rel="noreferrer">Trazas ↗</a> : null}
          </nav>
        ) : null}
        <div className="admin-tempo-check" aria-label="Diagnóstico de señales OTLP">
          <button type="button" className="secondary-btn" onClick={handleSignalProbe} disabled={signalProbeBusy}>
            {signalProbeBusy ? 'Probando señales…' : 'Probar logs + métricas + trazas'}
          </button>
          <small>
            {signalProbe
              ? `Logs ${signalProbe.signals?.logs?.flushed ? 'OK' : '—'} · Métricas ${signalProbe.signals?.metrics?.flushed ? 'OK' : '—'} · Trazas ${signalProbe.signals?.traces?.ok ? 'OK' : 'FALLO'}`
              : tracing?.signals
                ? `OTLP · logs ${tracing.signals.logs?.configured ? 'OK' : 'OFF'} · métricas ${tracing.signals.metrics?.configured ? 'OK' : 'OFF'} · trazas ${tracing.signals.traces?.configured ? 'OK' : 'OFF'}`
                : 'Comprueba de extremo a extremo las tres señales.'}
          </small>
          {signalProbe?.traceId ? <code>{signalProbe.traceId}</code> : null}
        </div>
        <div className="admin-tempo-check" aria-label="Diagnóstico de trazas Tempo">
          <button type="button" className="secondary-btn" onClick={handleTempoProbe} disabled={tempoProbeBusy}>
            {tempoProbeBusy ? 'Enviando traza…' : 'Probar Tempo'}
          </button>
          <small>
            {tempoProbe?.ok
              ? <>Entrega OTLP confirmada · <code>{tempoProbe.traceId}</code></>
              : tempoProbe
                ? `No confirmada · ${tempoProbeFailure(tempoProbe)}`
                : tracing?.configured
                  ? `OTLP activo · ${tracing.serviceName || 'backend'}`
                  : tracing?.enabled
                    ? `OTLP configurado, pero no inicializado${tracing.initializationError ? ` · ${tracing.initializationError}` : ''}`
                    : 'OTLP/Tempo sin configurar'}
          </small>
          {tempoProbe?.ok && grafanaTracesUrl ? <a href={grafanaTracesUrl} target="_blank" rel="noreferrer">Buscar en trazas ↗</a> : null}
        </div>
        <details className="admin-legacy-observability">
          <summary>Observabilidad legacy</summary>
          <div className="admin-legacy-observability-body">
            <div className="admin-legacy-observability-kpis">
              <span><small>API p95 · 24 h</small><strong>{metric(summary.apiP95Ms, ' ms')}</strong></span>
              <span><small>5xx · 24 h</small><strong>{metric(summary.error5xxPercent, '%')}</strong></span>
              <span><small>Mongo</small><strong>{summary.databaseLabel}</strong></span>
              <span><small>SLO</small><strong>{slo.statusLabel}</strong></span>
              <span><small>Error budget</small><strong>{errorBudget.statusLabel}</strong></span>
              <span><small>Burn rate</small><strong>{burnRate.statusLabel}</strong></span>
              <span><small>Release</small><strong>{releaseHealth.statusLabel}</strong></span>
              <span><small>Workers AI</small><strong>{summary.aiCloudflarePercent == null ? '—' : `${metric(summary.aiCloudflarePercent, '%')} CF`}</strong></span>
            </div>
            <button type="button" className="secondary-btn" onClick={onOpen}>Abrir panel legacy →</button>
          </div>
        </details>
      </div>
    </section>
  );
}
