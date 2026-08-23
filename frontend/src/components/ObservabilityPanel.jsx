import { useEffect, useMemo, useState } from 'react';
import { aiNarrativeStatus, fetchAiNarrativeMetrics, formatAiMetric } from '../aiMetrics.js';
import { fetchAdminObservability, formatDuration, summarizeAdminUsers } from '../observability.js';

const EVENT_LABELS = {
  player_portrait: 'Así te ve la CPU',
  blunder: 'Errores graves',
  catastrophic_blunder: 'Catástrofes',
  mistake: 'Errores',
  brilliant: 'Brillantes',
  tactic: 'Tácticas',
  great_move: 'Buenas jugadas',
  mate: 'Mates',
  generic: 'Otros',
};

const OBSERVABILITY_REFRESH_MS = 120000;

const REQUEST_KIND_LABELS = {
  portrait_manual: 'Lecturas manuales',
  portrait_auto: 'Lecturas automáticas',
  default: 'Comentarios de partida',
};

function metric(value, suffix = '') {
  return value == null || Number.isNaN(Number(value)) ? '—' : `${Number(value).toLocaleString('es-ES')}${suffix}`;
}

function databaseLabel(database) {
  if (!database) return 'Sin datos';
  if (database.status === 'ok') return 'Mongo OK';
  if (database.status === 'memory') return 'Memoria local';
  return 'Mongo DOWN';
}

function KeyValueList({ values, labels = {} }) {
  const rows = Object.entries(values || {}).sort((a, b) => Number(b[1]) - Number(a[1]));
  if (!rows.length) return <p className="hint-text">Todavía no hay muestras.</p>;
  return (
    <ul className="admin-observability-list">
      {rows.map(([key, value]) => (
        <li key={key}><span>{labels[key] || key}</span><strong>{Number(value).toLocaleString('es-ES')}</strong></li>
      ))}
    </ul>
  );
}

export default function ObservabilityPanel({ token, users = [], currentAdmin = null }) {
  const [runtime, setRuntime] = useState(null);
  const [ai, setAi] = useState(null);
  const [loading, setLoading] = useState(true);
  const userSummary = useMemo(() => summarizeAdminUsers(users, currentAdmin), [users, currentAdmin]);

  async function refresh({ silent = false } = {}) {
    if (!silent) setLoading(true);
    const [runtimeResult, aiResult] = await Promise.all([
      fetchAdminObservability({ token }),
      fetchAiNarrativeMetrics({ token }),
    ]);
    setRuntime(runtimeResult);
    setAi(aiResult);
    setLoading(false);
  }

  useEffect(() => {
    let active = true;
    async function tick(silent = false) {
      if (!silent) setLoading(true);
      const [runtimeResult, aiResult] = await Promise.all([
        fetchAdminObservability({ token }),
        fetchAiNarrativeMetrics({ token }),
      ]);
      if (!active) return;
      setRuntime(runtimeResult);
      setAi(aiResult);
      setLoading(false);
    }
    void tick(false);
    const timer = window.setInterval(() => { void tick(true); }, OBSERVABILITY_REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [token]);

  const hour = runtime?.http?.last_1h || {};
  const quarter = runtime?.http?.last_15m || {};
  const database = runtime?.database || null;
  const aiStatus = aiNarrativeStatus(ai);

  return (
    <section className="admin-observability" aria-label="Observabilidad de Chess Studio">
      <div className="admin-observability-heading">
        <div>
          <span className="section-label">Observabilidad</span>
          <h3>Estado de Chess Studio</h3>
        </div>
        <span className={`admin-observability-health ${Number(hour.status_5xx || 0) > 0 || database?.status === 'down' ? 'is-warn' : ''}`}>
          {loading ? 'Midiendo…' : database?.status === 'down' ? 'Degradado' : 'Operativo'}
        </span>
      </div>

      <div className="admin-observability-summary">
        <div><span>API p95 · 1 h</span><strong>{metric(hour.p95_ms, ' ms')}</strong></div>
        <div><span>Errores 5xx</span><strong>{metric(hour.error_5xx_percent, '%')}</strong></div>
        <div><span>Persistencia</span><strong>{databaseLabel(database)}</strong></div>
        <div><span>Workers AI</span><strong>{ai ? `${formatAiMetric(ai.cloudflarePercent, '%')} CF` : '—'}</strong></div>
      </div>

      <details className="friendly-disclosure admin-observability-details">
        <summary>Ver métricas completas</summary>
        <div className="friendly-disclosure-body admin-observability-body">
          <div className="admin-observability-toolbar">
            <p className="hint-text">Métricas técnicas agregadas. Sin jugadas, FEN, mensajes, clicks ni identidad sensible.</p>
            <button type="button" className="secondary-btn" disabled={loading} onClick={() => void refresh()}>{loading ? 'Actualizando…' : 'Actualizar'}</button>
          </div>

          <div className="admin-observability-grid">
            <article>
              <h4>API / Render</h4>
              <dl>
                <div><dt>Uptime proceso</dt><dd>{formatDuration(runtime?.http?.uptime_seconds)}</dd></div>
                <div><dt>Requests · 15 min</dt><dd>{metric(quarter.samples)}</dd></div>
                <div><dt>Req/min · 15 min</dt><dd>{metric(quarter.requests_per_minute)}</dd></div>
                <div><dt>Latencias p50 / p95 / p99</dt><dd>{metric(quarter.p50_ms)} / {metric(quarter.p95_ms)} / {metric(quarter.p99_ms)} ms</dd></div>
                <div><dt>4xx · 1 h</dt><dd>{metric(hour.status_4xx)}</dd></div>
                <div><dt>5xx · 1 h</dt><dd>{metric(hour.status_5xx)}</dd></div>
              </dl>
              <small>Ventana en memoria; se reinicia al redeploy/restart de Render.</small>
            </article>

            <article>
              <h4>Persistencia</h4>
              <dl>
                <div><dt>Estado</dt><dd>{databaseLabel(database)}</dd></div>
                <div><dt>Ping</dt><dd>{metric(database?.latency_ms, ' ms')}</dd></div>
                <div><dt>Modo</dt><dd>{database?.mode || '—'}</dd></div>
              </dl>
              {database?.error ? <small>Último probe: {database.error}</small> : null}
            </article>

            <article>
              <h4>Usuarios / juego</h4>
              <dl>
                <div><dt>Usuarios</dt><dd>{metric(userSummary.registered)}</dd></div>
                <div><dt>Primer plano</dt><dd>{metric(userSummary.foreground)}</dd></div>
                <div><dt>En línea</dt><dd>{metric(userSummary.online)}</dd></div>
                <div><dt>Inactivos</dt><dd>{metric(userSummary.idle)}</dd></div>
                <div><dt>Partidas guardadas</dt><dd>{metric(userSummary.totalGames)}</dd></div>
                <div><dt>Batallas Combat</dt><dd>{metric(userSummary.combatBattles)}</dd></div>
              </dl>
            </article>

            <article>
              <h4>Workers AI</h4>
              <dl>
                <div><dt>Estado</dt><dd>{aiStatus}</dd></div>
                <div><dt>Muestras</dt><dd>{metric(ai?.samples)}</dd></div>
                <div><dt>Cloudflare / fallback</dt><dd>{formatAiMetric(ai?.cloudflarePercent, '%')} / {formatAiMetric(ai?.fallbackPercent, '%')}</dd></div>
                <div><dt>Latencias p50 / p95 / p99</dt><dd>{formatAiMetric(ai?.p50Ms)} / {formatAiMetric(ai?.p95Ms)} / {formatAiMetric(ai?.p99Ms)} ms</dd></div>
                <div><dt>Tokens entrada / salida</dt><dd>{metric(ai?.usage?.inputTokens)} / {metric(ai?.usage?.outputTokens)}</dd></div>
                <div><dt>Neuronas estimadas</dt><dd>{metric(ai?.usage?.estimatedNeurons)}</dd></div>
                <div><dt>Coste estimado ventana</dt><dd>{ai?.usage ? `$${Number(ai.usage.estimatedCostUsd || 0).toFixed(6)}` : '—'}</dd></div>
                <div><dt>Fallos seguidos</dt><dd>{metric(ai?.circuit?.consecutiveFailures)}</dd></div>
              </dl>
              <small>{ai?.usage?.pricingNote || 'Cloudflare sigue siendo la fuente de verdad para consumo y billing.'}</small>
            </article>
          </div>

          <div className="admin-observability-deep-grid">
            <article>
              <h4>Rutas más activas · 1 h</h4>
              <ul className="admin-observability-list">
                {(hour.top_routes || []).map((row) => (
                  <li key={row.route}><span><code>{row.route}</code></span><strong>{row.requests} · p95 {metric(row.p95_ms, ' ms')}</strong></li>
                ))}
              </ul>
            </article>
            <article><h4>Eventos AI</h4><KeyValueList values={ai?.eventTypes} labels={EVENT_LABELS} /></article>
            <article><h4>Origen de peticiones AI</h4><KeyValueList values={ai?.requestKinds} labels={REQUEST_KIND_LABELS} /></article>
            <article><h4>Fallback / errores AI</h4><KeyValueList values={ai?.reasons} /></article>
            <article><h4>Releases en uso</h4><KeyValueList values={userSummary.releases} /></article>
            <article><h4>Modelos AI</h4><KeyValueList values={ai?.models} /></article>
          </div>
        </div>
      </details>
    </section>
  );
}
