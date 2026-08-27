import { useEffect, useMemo, useState } from 'react';
import { burnRateForSlo, errorBudgetForSlo, evaluateProductSlos, evaluateReleaseHealth, fetchAdminObservability, observabilityRangeForPreset, summarizeObservabilityHealth } from '../observability.js';
import { APP_RELEASE } from '../release.js';

function metric(value, suffix = '') {
  return value == null || Number.isNaN(Number(value)) ? '—' : `${Number(value).toLocaleString('es-ES')}${suffix}`;
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

  useEffect(() => {
    let active = true;
    const range = observabilityRangeForPreset('24h');
    fetchAdminObservability({ token, from: range.from, to: range.to })
      .then((payload) => { if (active) setRuntime(payload); })
      .catch(() => { if (active) setRuntime(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  const summary = useMemo(() => summarizeObservabilityHealth(runtime, users, currentAdmin), [runtime, users, currentAdmin]);
  const slo = useMemo(() => evaluateProductSlos(runtime), [runtime]);
  const errorBudget = useMemo(() => errorBudgetForSlo(runtime), [runtime]);
  const burnRate = useMemo(() => burnRateForSlo(runtime), [runtime]);
  const releaseHealth = useMemo(() => evaluateReleaseHealth(runtime, APP_RELEASE), [runtime]);
  const verdict = operationalVerdict({ loading, summary, slo, burnRate, runtime });
  const grafanaUrl = String(import.meta.env.VITE_GRAFANA_LOGS_DASHBOARD_URL || import.meta.env.VITE_GRAFANA_CLOUD_URL || 'https://grafana.com/').trim();

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
