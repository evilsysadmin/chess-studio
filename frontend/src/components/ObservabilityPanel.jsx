import { useCallback, useEffect, useState } from 'react';

// Grafana owns historical observability. Admin only checks API reachability
// and the round-trip latency as observed by this browser.
const HEALTH_URL = `${String(import.meta.env?.VITE_API_URL || 'http://localhost:4000/api').replace(/\/$/, '')}/health`;
const HEALTH_TIMEOUT_MS = 6000;

export default function ObservabilityPanel() {
  const [status, setStatus] = useState({ kind: 'loading', latencyMs: null, checkedAt: null });
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((previous) => previous + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    const started = performance.now();
    setStatus({ kind: 'loading', latencyMs: null, checkedAt: null });
    fetch(HEALTH_URL, { signal: controller.signal, cache: 'no-store' })
      .then((response) => {
        if (!active) return;
        setStatus({
          kind: response.ok ? 'ok' : 'unavailable',
          latencyMs: Math.round(performance.now() - started),
          checkedAt: new Date().toLocaleTimeString('es-ES'),
        });
      })
      .catch(() => {
        if (active) setStatus({ kind: 'unavailable', latencyMs: null, checkedAt: new Date().toLocaleTimeString('es-ES') });
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [revision]);

  return (
    <section className="admin-observability" aria-label="Estado de la API">
      <h3>Estado de la API</h3>
      <p className="hint-text">Comprobación puntual desde este navegador. Las métricas, alertas y trazas se consultan en Grafana.</p>
      <div className="admin-observability-list">
        <p role="status">
          <strong>Disponibilidad:</strong>{' '}
          {status.kind === 'loading' ? 'Comprobando…' : status.kind === 'ok' ? 'API accesible' : 'No se pudo comprobar la API'}
        </p>
        <p><strong>Latencia de ida y vuelta:</strong> {status.latencyMs == null ? '—' : `${status.latencyMs} ms`}</p>
        <p className="hint-text">Última comprobación: {status.checkedAt || '—'}</p>
      </div>
      <button type="button" className="secondary-btn" onClick={refresh} disabled={status.kind === 'loading'}>Volver a comprobar</button>
    </section>
  );
}
