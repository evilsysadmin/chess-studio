import { useEffect, useMemo, useState } from 'react';
import { burnRateForSlo, errorBudgetForSlo, evaluateProductSlos, evaluateReleaseHealth, fetchAdminObservability, observabilityRangeForPreset, summarizeObservabilityHealth } from '../observability.js';
import { APP_RELEASE } from '../release.js';

function metric(value, suffix = '') {
  return value == null || Number.isNaN(Number(value)) ? '—' : `${Number(value).toLocaleString('es-ES')}${suffix}`;
}

export default function AdminObservabilitySummary({ token, users = [], currentAdmin = null, onOpen }) {
  const [runtime, setRuntime] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const range = observabilityRangeForPreset('24h');
    fetchAdminObservability({ token, from: range.from, to: range.to })
      .then((payload) => { if (active) setRuntime(payload); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  const summary = useMemo(
    () => summarizeObservabilityHealth(runtime, users, currentAdmin),
    [runtime, users, currentAdmin],
  );
  const slo = useMemo(() => evaluateProductSlos(runtime), [runtime]);
  const errorBudget = useMemo(() => errorBudgetForSlo(runtime), [runtime]);
  const burnRate = useMemo(() => burnRateForSlo(runtime), [runtime]);
  const releaseHealth = useMemo(() => evaluateReleaseHealth(runtime, APP_RELEASE), [runtime]);

  return (
    <section className="admin-observability-launcher" aria-label="Resumen de observabilidad">
      <div className="admin-observability-launcher-heading">
        <div>
          <span className="section-label">Observabilidad</span>
          <h3>Salud de Chess Studio</h3>
        </div>
        <span className={`admin-observability-health${summary.status === 'degraded' ? ' is-warn' : ''}`}>
          {loading ? 'Midiendo…' : summary.statusLabel}
        </span>
      </div>
      <div className="admin-observability-launcher-kpis">
        <div><span>API p95 · 24 h</span><strong>{metric(summary.apiP95Ms, ' ms')}</strong></div>
        <div><span>5xx · 24 h</span><strong>{metric(summary.error5xxPercent, '%')}</strong></div>
        <div><span>Mongo</span><strong>{summary.databaseLabel}</strong></div>
        <div><span>Workers AI</span><strong>{summary.aiCloudflarePercent == null ? '—' : `${metric(summary.aiCloudflarePercent, '%')} CF`}</strong></div>
        <div className={`admin-slo-kpi ${slo.status === 'missed' ? 'is-warn' : ''}`}><span>SLO producto</span><strong>{slo.statusLabel}</strong><small>{slo.availabilityPercent == null ? 'Disponibilidad —' : `${metric(slo.availabilityPercent, '%')} · objetivo ${metric(slo.availabilityTarget, '%')}`} · {slo.apiP95Ms == null ? 'p95 —' : `p95 ${metric(slo.apiP95Ms, ' ms')} / ${metric(slo.apiP95TargetMs, ' ms')}`}</small></div>
        <div className={`admin-slo-kpi ${errorBudget.status === 'exhausted' ? 'is-warn' : ''}`}><span>Error budget · 24 h</span><strong>{errorBudget.statusLabel}</strong><small>{errorBudget.consumedPercent == null ? 'Sin muestra suficiente' : `${metric(errorBudget.consumedPercent, '%')} consumido · ${metric(errorBudget.remainingPercent, '%')} restante`}</small></div>
        <div className={`admin-slo-kpi ${burnRate.status === 'fast' ? 'is-warn' : ''}`}><span>Burn rate</span><strong>{burnRate.statusLabel}</strong><small>15 min {burnRate.short.burnRate == null ? '—' : `${burnRate.short.burnRate}×`} · 1 h {burnRate.long.burnRate == null ? '—' : `${burnRate.long.burnRate}×`}</small></div>
        <div className={`admin-slo-kpi ${runtime?.resilience?.level === 'critical' ? 'is-warn' : ''}`}><span>Resiliencia</span><strong>{runtime?.resilience?.level || '—'}</strong><small>{metric(runtime?.resilience?.shed_last_5m)} shed · {metric(runtime?.resilience?.bulkhead_rejections_last_5m)} bulkhead / 5 min</small></div>
        <div className={`admin-slo-kpi ${['regression', 'degraded'].includes(releaseHealth.status) ? 'is-warn' : ''}`}><span>Release health</span><strong>{releaseHealth.statusLabel}</strong><small><code>{APP_RELEASE}</code> · {releaseHealth.requests || 0} requests{releaseHealth.p95Ms == null ? '' : ` · p95 ${metric(releaseHealth.p95Ms, ' ms')}`}</small></div>
      </div>
      <div className="admin-observability-launcher-actions">
        <p className="hint-text">Resumen técnico de 24 h con SLO, error budget y salud de la release actual. Presencia y usuarios van debajo; dashboards e histórico viven en su propia vista.</p>
        <button type="button" className="secondary-btn" onClick={onOpen}>Abrir observabilidad →</button>
      </div>
    </section>
  );
}
