import { GRAFANA_HEALTH_DASHBOARD_URL } from '../adminObservabilityLinks.js';

export default function AdminObservabilitySummary({ onOpen }) {

  return (
    <section className="admin-observability-launcher" aria-label="Resumen de observabilidad">
      <div className="admin-observability-launcher-heading">
        <div>
          <span className="section-label">Observabilidad</span>
          <h3>Salud operativa</h3>
        </div>
        <span className="admin-observability-health">Grafana Cloud</span>
      </div>
      <div className="admin-observability-launcher-actions">
        <p className="hint-text">Métricas en tiempo real, errores y latencia viven en el dashboard operativo.</p>
        <a className="primary-btn admin-grafana-link" href={GRAFANA_HEALTH_DASHBOARD_URL} target="_blank" rel="noreferrer">Abrir salud en Grafana ↗</a>
      </div>
      <details className="friendly-disclosure admin-observability-legacy">
        <summary>Histórico interno y fallback</summary>
        <div className="friendly-disclosure-body">
          <p className="hint-text">Resumen agregado que sigue disponible si Grafana no está accesible. No sustituye al dashboard operativo.</p>
          <button type="button" className="secondary-btn" onClick={onOpen}>Abrir histórico interno →</button>
        </div>
      </details>
    </section>
  );
}
