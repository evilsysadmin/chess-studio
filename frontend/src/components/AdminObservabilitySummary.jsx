import { useEffect, useMemo, useState } from 'react';
import { fetchAdminObservability, observabilityRangeForPreset, summarizeObservabilityHealth } from '../observability.js';

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
        <div><span>Usuarios online</span><strong>{metric(summary.onlineUsers)}</strong></div>
      </div>
      <div className="admin-observability-launcher-actions">
        <p className="hint-text">Resumen de 24 h. Dashboards, histórico, percentiles y auto-refresh viven en su propia vista.</p>
        <button type="button" className="secondary-btn" onClick={onOpen}>Abrir observabilidad →</button>
      </div>
    </section>
  );
}
