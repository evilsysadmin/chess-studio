import { useEffect, useMemo, useState } from 'react';
import { aiNarrativeStatus, fetchAiNarrativeMetrics, formatAiMetric } from '../aiMetrics.js';
import {
  fetchAdminObservability,
  formatDuration,
  observabilityRangeForPreset,
  summarizeAdminUsers,
} from '../observability.js';
import { requestRemoteNarrative } from '../narrativeRemote.js';
import { buildObservabilitySummaryDossier } from '../aiNarrativeTasks.js';

const EVENT_LABELS = {
  player_portrait: 'Así te ve la CPU',
  blunder: 'Errores graves',
  catastrophic_blunder: 'Catástrofes',
  mistake: 'Errores',
  brilliant: 'Brillantes',
  tactic: 'Tácticas',
  great_move: 'Buenas jugadas',
  mate: 'Mates',
  post_game_autopsy: 'Autopsias post-partida',
  combat_briefing: 'Briefings Combat',
  combat_debrief: 'Debriefings Combat',
  observability_summary: 'Diagnóstico SRE',
  generic: 'Otros',
};

const OBSERVABILITY_REFRESH_MS = 120000;

const REQUEST_KIND_LABELS = {
  portrait_manual: 'Lecturas manuales',
  portrait_auto: 'Lecturas automáticas',
  post_game: 'Autopsias post-partida',
  combat_briefing: 'Briefings Combat',
  combat_debrief: 'Debriefings Combat',
  observability_summary: 'Diagnósticos SRE',
  default: 'Comentarios de partida',
};

const RANGE_LABELS = {
  '24h': '24 h',
  '7d': '7 días',
  '30d': '30 días',
  custom: 'rango elegido',
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

function localDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

function HistorySeries({ series = [], resolution = 'hour' }) {
  if (!series.length) return <p className="hint-text">Aún no hay histórico para este rango.</p>;
  const maxRequests = Math.max(1, ...series.map((row) => Number(row.http_requests || 0)));
  return (
    <div className="admin-observability-series" aria-label="Evolución de requests del rango">
      {series.map((row) => {
        const at = new Date(row.at);
        const label = Number.isNaN(at.getTime())
          ? row.at
          : resolution === 'day'
            ? at.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
            : at.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        const requests = Number(row.http_requests || 0);
        return (
          <div className="admin-observability-series-row" key={row.at}>
            <time>{label}</time>
            <span className="admin-observability-series-bar" aria-hidden="true">
              <span style={{ width: `${Math.max(2, (requests / maxRequests) * 100)}%` }} />
            </span>
            <strong>{requests}</strong>
          </div>
        );
      })}
    </div>
  );
}

export default function ObservabilityPanel({ token, users = [], currentAdmin = null }) {
  const [runtime, setRuntime] = useState(null);
  const [ai, setAi] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rangePreset, setRangePreset] = useState('24h');
  const [customFrom, setCustomFrom] = useState(() => localDateInputValue(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));
  const [customTo, setCustomTo] = useState(() => localDateInputValue(new Date()));
  const [aiSummary, setAiSummary] = useState(null);
  const [aiSummaryStatus, setAiSummaryStatus] = useState('idle');
  const userSummary = useMemo(() => summarizeAdminUsers(users, currentAdmin), [users, currentAdmin]);

  async function loadMetrics({ silent = false, activeCheck = () => true } = {}) {
    if (!silent) setLoading(true);
    // Los presets "últimas X horas/días" son ventanas móviles. Calculamos
    // el extremo `to` en cada refresh en vez de congelarlo al montar el panel.
    const rangeRequest = observabilityRangeForPreset(rangePreset, customFrom, customTo);
    const [runtimeResult, aiResult] = await Promise.all([
      fetchAdminObservability({ token, from: rangeRequest.from, to: rangeRequest.to }),
      fetchAiNarrativeMetrics({ token }),
    ]);
    if (!activeCheck()) return;
    setRuntime(runtimeResult);
    setAi(aiResult);
    setLoading(false);
  }

  function refresh({ silent = false } = {}) {
    if (!silent) {
      setAiSummary(null);
      setAiSummaryStatus('idle');
    }
    return loadMetrics({ silent });
  }

  async function explainObservability() {
    if (!runtime || aiSummaryStatus === 'loading') return;
    const dossier = buildObservabilitySummaryDossier({ runtime, ai, rangeLabel });
    if (!dossier) return;
    setAiSummaryStatus('loading');
    const text = await requestRemoteNarrative(dossier, { token, timeoutMs: 8000 });
    setAiSummary(text || null);
    setAiSummaryStatus(text ? 'done' : 'unavailable');
  }

  useEffect(() => {
    setAiSummary(null);
    setAiSummaryStatus('idle');
    let active = true;
    const activeCheck = () => active;
    void loadMetrics({ silent: false, activeCheck });
    const timer = window.setInterval(() => {
      void loadMetrics({ silent: true, activeCheck });
    }, OBSERVABILITY_REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [token, rangePreset, customFrom, customTo]);

  const hour = runtime?.http?.last_1h || {};
  const database = runtime?.database || null;
  const history = runtime?.history || {};
  const historyHttp = history?.http || {};
  const historyAi = history?.ai || {};
  const historyRange = history?.range || {};
  const aiStatus = aiNarrativeStatus(ai);
  const rangeLabel = RANGE_LABELS[rangePreset] || 'rango';

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
        <div><span>API p95 · {rangeLabel}</span><strong>{metric(historyHttp.p95_ms, ' ms')}</strong></div>
        <div><span>Errores 5xx · {rangeLabel}</span><strong>{metric(historyHttp.error_5xx_percent, '%')}</strong></div>
        <div><span>Persistencia</span><strong>{databaseLabel(database)}</strong></div>
        <div><span>Workers AI · {rangeLabel}</span><strong>{historyAi.samples ? `${formatAiMetric(historyAi.cloudflare_percent, '%')} CF` : '—'}</strong></div>
      </div>

      <details className="friendly-disclosure admin-observability-details">
        <summary>Ver métricas completas</summary>
        <div className="friendly-disclosure-body admin-observability-body">
          <div className="admin-observability-toolbar">
            <p className="hint-text">Métricas técnicas agregadas. Sin jugadas, FEN, mensajes, clicks ni identidad sensible.</p>
            <div className="admin-observability-toolbar-actions">
              <button type="button" className="secondary-btn" disabled={loading || !runtime || aiSummaryStatus === 'loading'} onClick={() => void explainObservability()}>
                {aiSummaryStatus === 'loading' ? 'Interpretando…' : '¿Qué está pasando?'}
              </button>
              <button type="button" className="secondary-btn" disabled={loading} onClick={() => void refresh()}>{loading ? 'Actualizando…' : 'Actualizar'}</button>
            </div>
          </div>

          {aiSummaryStatus === 'loading' && <div className="ai-task-card admin-observability-ai-summary is-loading"><small>CPU // SRE AI</small><p>Mirando los números antes de culpar a Mongo por costumbre…</p></div>}
          {aiSummary && <div className="ai-task-card admin-observability-ai-summary"><small>CPU // SRE AI · WORKERS AI</small><p>{aiSummary}</p></div>}
          {aiSummaryStatus === 'unavailable' && <p className="hint-text">Workers AI no respondió; las métricas de abajo siguen siendo la fuente factual.</p>}

          <div className="admin-observability-range" aria-label="Rango temporal de observabilidad">
            <label>
              <span>Rango</span>
              <select value={rangePreset} onChange={(event) => setRangePreset(event.target.value)}>
                <option value="24h">Últimas 24 horas</option>
                <option value="7d">Últimos 7 días</option>
                <option value="30d">Últimos 30 días</option>
                <option value="custom">Fechas concretas</option>
              </select>
            </label>
            {rangePreset === 'custom' ? (
              <>
                <label><span>Desde</span><input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} /></label>
                <label><span>Hasta</span><input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} /></label>
              </>
            ) : null}
            <small>{historyRange.persistent ? 'Histórico agregado en Mongo' : 'Histórico disponible sólo desde este proceso'} · resolución {historyRange.resolution === 'day' ? 'diaria' : 'horaria'}.</small>
          </div>

          <div className="admin-observability-grid">
            <article>
              <h4>API / Render · {rangeLabel}</h4>
              <dl>
                <div><dt>Uptime proceso ahora</dt><dd>{formatDuration(runtime?.http?.uptime_seconds)}</dd></div>
                <div><dt>Requests</dt><dd>{metric(historyHttp.samples)}</dd></div>
                <div><dt>Req/min</dt><dd>{metric(historyHttp.requests_per_minute)}</dd></div>
                <div><dt>Latencias p50 / p95 / p99</dt><dd>{metric(historyHttp.p50_ms)} / {metric(historyHttp.p95_ms)} / {metric(historyHttp.p99_ms)} ms</dd></div>
                <div><dt>4xx</dt><dd>{metric(historyHttp.status_4xx)}</dd></div>
                <div><dt>5xx</dt><dd>{metric(historyHttp.status_5xx)}</dd></div>
              </dl>
              <small>Histórico agregado por horas; los percentiles históricos se estiman por buckets de latencia.</small>
            </article>

            <article>
              <h4>Persistencia · ahora</h4>
              <dl>
                <div><dt>Estado</dt><dd>{databaseLabel(database)}</dd></div>
                <div><dt>Ping</dt><dd>{metric(database?.latency_ms, ' ms')}</dd></div>
                <div><dt>Modo</dt><dd>{database?.mode || '—'}</dd></div>
              </dl>
              {database?.error ? <small>Último probe: {database.error}</small> : null}
            </article>

            <article>
              <h4>Usuarios / juego · ahora</h4>
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
              <h4>Workers AI · {rangeLabel}</h4>
              <dl>
                <div><dt>Estado ahora</dt><dd>{aiStatus}</dd></div>
                <div><dt>Muestras</dt><dd>{metric(historyAi.samples)}</dd></div>
                <div><dt>Cloudflare / fallback</dt><dd>{formatAiMetric(historyAi.cloudflare_percent, '%')} / {formatAiMetric(historyAi.fallback_percent, '%')}</dd></div>
                <div><dt>Latencias p50 / p95 / p99</dt><dd>{formatAiMetric(historyAi.p50_ms)} / {formatAiMetric(historyAi.p95_ms)} / {formatAiMetric(historyAi.p99_ms)} ms</dd></div>
                <div><dt>Tokens entrada / salida</dt><dd>{metric(historyAi.usage?.input_tokens)} / {metric(historyAi.usage?.output_tokens)}</dd></div>
                <div><dt>Neuronas estimadas</dt><dd>{metric(historyAi.usage?.estimated_neurons)}</dd></div>
                <div><dt>Coste estimado rango</dt><dd>{historyAi.usage ? `$${Number(historyAi.usage.estimated_cost_usd || 0).toFixed(6)}` : '—'}</dd></div>
                <div><dt>Fallos seguidos ahora</dt><dd>{metric(ai?.circuit?.consecutiveFailures)}</dd></div>
              </dl>
              <small>El histórico guarda sólo agregados. Cloudflare sigue siendo la fuente de verdad para consumo y billing.</small>
            </article>
          </div>

          <div className="admin-observability-deep-grid">
            <article>
              <h4>Evolución de requests · {rangeLabel}</h4>
              <HistorySeries series={history?.series || []} resolution={historyRange.resolution} />
            </article>
            <article>
              <h4>Rutas más activas · {rangeLabel}</h4>
              <ul className="admin-observability-list">
                {(historyHttp.top_routes || []).map((row) => (
                  <li key={row.route}><span><code>{row.route}</code></span><strong>{row.requests} · p95 {metric(row.p95_ms, ' ms')}</strong></li>
                ))}
              </ul>
            </article>
            <article><h4>Eventos AI · {rangeLabel}</h4><KeyValueList values={historyAi.event_types} labels={EVENT_LABELS} /></article>
            <article><h4>Origen de peticiones AI · {rangeLabel}</h4><KeyValueList values={historyAi.request_kinds} labels={REQUEST_KIND_LABELS} /></article>
            <article><h4>Fallback / errores AI · {rangeLabel}</h4><KeyValueList values={historyAi.reasons} /></article>
            <article><h4>Detalle devuelto por Worker · {rangeLabel}</h4><KeyValueList values={historyAi.worker_errors} /></article>
            <article><h4>Releases en uso · ahora</h4><KeyValueList values={userSummary.releases} /></article>
            <article><h4>Modelos AI · {rangeLabel}</h4><KeyValueList values={historyAi.models} /></article>
          </div>
        </div>
      </details>
    </section>
  );
}
