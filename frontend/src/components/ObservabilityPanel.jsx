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
import {
  DEFAULT_OBSERVABILITY_AUTO_REFRESH_MS,
  OBSERVABILITY_AUTO_REFRESH_OPTIONS,
} from '../observabilityRefresh.js';

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

const LATENCY_VIEWS = ['p50', 'p95', 'p99', 'all'];

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

const DASHBOARD_TABS = [
  { id: 'health', label: 'Salud general' },
  { id: 'ai', label: 'Workers AI' },
  { id: 'traffic', label: 'Tráfico' },
];

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

function seriesLabel(value, resolution) {
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return String(value || '');
  return resolution === 'day'
    ? at.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
    : at.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function compactAxisMetric(value, suffix = '') {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const shown = abs >= 1000 ? `${Number((n / 1000).toFixed(abs >= 10000 ? 0 : 1))}k` : `${Math.round(n)}`;
  return `${shown}${suffix}`;
}

function niceCeiling(value) {
  const raw = Math.max(1, Number(value) || 1);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const scaled = raw / magnitude;
  const nice = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return nice * magnitude;
}

function LineChart({ series = [], valueKey, valueKeys = null, title, suffix = '', resolution = 'hour', ceiling = null }) {
  const definitions = (valueKeys || [{ key: valueKey, label: null }]).filter((item) => item?.key);
  const prepared = definitions.map((definition) => ({
    ...definition,
    points: series
      .map((row) => ({ at: row.at, value: Number(row[definition.key]) }))
      .filter((row) => Number.isFinite(row.value)),
  })).filter((definition) => definition.points.length);
  if (!prepared.length) return <div className="admin-observability-chart is-empty"><h4>{title}</h4><p className="hint-text">Aún no hay histórico.</p></div>;

  const width = 620;
  const height = 180;
  const padLeft = 54;
  const padRight = 16;
  const padTop = 12;
  const padBottom = 24;
  const allValues = prepared.flatMap((definition) => definition.points.map((row) => row.value));
  const rawMax = Math.max(...allValues, 1);
  const maxValue = ceiling == null ? niceCeiling(rawMax) : Math.max(Number(ceiling), rawMax);
  const minValue = 0;
  const range = Math.max(1, maxValue - minValue);
  const tickCount = 4;
  const ticks = Array.from({ length: tickCount + 1 }, (_, index) => maxValue - (index / tickCount) * range);
  const preparedCoords = prepared.map((definition) => ({
    ...definition,
    coords: definition.points.map((row, index) => {
      const x = definition.points.length === 1 ? (padLeft + width - padRight) / 2 : padLeft + (index / (definition.points.length - 1)) * (width - padLeft - padRight);
      const y = padTop + ((maxValue - row.value) / range) * (height - padTop - padBottom);
      return { ...row, x, y };
    }),
  }));
  const first = preparedCoords[0]?.coords[0];
  const last = preparedCoords[0]?.coords.at(-1);

  return (
    <div className="admin-observability-chart">
      <div className="admin-observability-chart-heading">
        <h4>{title}</h4>
        {preparedCoords.length === 1 ? <strong>{metric(last?.value, suffix)}</strong> : null}
      </div>
      {preparedCoords.length > 1 ? (
        <div className="admin-observability-chart-legend">
          {preparedCoords.map((definition, index) => <span key={definition.key} className={`chart-series-${index}`}>{definition.label}: {metric(definition.coords.at(-1)?.value, suffix)}</span>)}
        </div>
      ) : null}
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
        {ticks.map((tick, index) => {
          const y = padTop + (index / tickCount) * (height - padTop - padBottom);
          return <g key={tick}><line x1={padLeft} x2={width - padRight} y1={y} y2={y} className="chart-grid-line" /><text x={padLeft - 7} y={y + 3} textAnchor="end" className="chart-y-label">{compactAxisMetric(tick, suffix)}</text></g>;
        })}
        {preparedCoords.map((definition, index) => (
          <g key={definition.key}>
            <polyline points={definition.coords.map((row) => `${row.x.toFixed(1)},${row.y.toFixed(1)}`).join(' ')} fill="none" className={`chart-line chart-series-${index}`} vectorEffect="non-scaling-stroke" />
            {definition.coords.map((row) => <circle key={`${definition.key}-${row.at}-${row.x}`} cx={row.x} cy={row.y} r="3" className={`chart-point chart-series-${index}`}><title>{definition.label ? `${definition.label} · ` : ''}{seriesLabel(row.at, resolution)} · {metric(row.value, suffix)}</title></circle>)}
          </g>
        ))}
      </svg>
      <div className="admin-observability-chart-axis"><span>{seriesLabel(first?.at, resolution)}</span><span>{seriesLabel(last?.at, resolution)}</span></div>
    </div>
  );
}

function BarChart({ series = [], valueKey, title, resolution = 'hour' }) {
  const rows = series
    .map((row) => ({ at: row.at, value: Number(row[valueKey] || 0) }))
    .filter((row) => Number.isFinite(row.value));
  if (!rows.length) return <div className="admin-observability-chart is-empty"><h4>{title}</h4><p className="hint-text">Aún no hay histórico.</p></div>;
  const maxValue = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className="admin-observability-chart admin-observability-bars">
      <div className="admin-observability-chart-heading"><h4>{title}</h4><strong>{metric(rows.reduce((sum, row) => sum + row.value, 0))}</strong></div>
      <div className="admin-observability-bar-track" aria-label={title}>
        {rows.map((row) => (
          <span key={row.at} title={`${seriesLabel(row.at, resolution)} · ${metric(row.value)}`} style={{ height: `${Math.max(3, (row.value / maxValue) * 100)}%` }} />
        ))}
      </div>
      <div className="admin-observability-chart-axis"><span>{seriesLabel(rows[0]?.at, resolution)}</span><span>{seriesLabel(rows.at(-1)?.at, resolution)}</span></div>
    </div>
  );
}

function latencyDefinitions(prefix, view) {
  const all = [
    { key: `${prefix}_p50_ms`, label: 'p50' },
    { key: `${prefix}_p95_ms`, label: 'p95' },
    { key: `${prefix}_p99_ms`, label: 'p99' },
  ];
  return view === 'all' ? all : all.filter((item) => item.label === view);
}

function Dashboard({ tab, history, historyHttp, historyAi, historyRange, latencyView }) {
  const series = history?.series || [];
  const resolution = historyRange?.resolution || 'hour';

  if (tab === 'ai') {
    return (
      <div className="admin-observability-dashboard-grid">
        <LineChart series={series} valueKeys={latencyDefinitions('ai', latencyView)} title={`Latencia Workers AI · ${latencyView === 'all' ? 'p50 / p95 / p99' : latencyView}`} suffix=" ms" resolution={resolution} />
        <LineChart series={series} valueKey="ai_cloudflare_percent" title="Respuestas Cloudflare" suffix="%" resolution={resolution} ceiling={100} />
        <BarChart series={series} valueKey="ai_samples" title="Llamadas AI" resolution={resolution} />
        <div className="admin-observability-dashboard-kpis">
          <div><span>Cloudflare</span><strong>{formatAiMetric(historyAi.cloudflare_percent, '%')}</strong></div>
          <div><span>Fallback</span><strong>{formatAiMetric(historyAi.fallback_percent, '%')}</strong></div>
          <div><span>Neuronas</span><strong>{metric(historyAi.usage?.estimated_neurons)}</strong></div>
          <div><span>Coste est.</span><strong>{historyAi.usage ? `$${Number(historyAi.usage.estimated_cost_usd || 0).toFixed(6)}` : '—'}</strong></div>
        </div>
      </div>
    );
  }

  if (tab === 'traffic') {
    return (
      <div className="admin-observability-dashboard-grid">
        <BarChart series={series} valueKey="http_requests" title="Requests" resolution={resolution} />
        <LineChart series={series} valueKey="http_5xx" title="Errores 5xx" resolution={resolution} />
        <LineChart series={series} valueKey="http_4xx" title="Errores 4xx" resolution={resolution} />
        <div className="admin-observability-dashboard-kpis">
          <div><span>Req/min</span><strong>{metric(historyHttp.requests_per_minute)}</strong></div>
          <div><span>Requests</span><strong>{metric(historyHttp.samples)}</strong></div>
          <div><span>4xx</span><strong>{metric(historyHttp.status_4xx)}</strong></div>
          <div><span>5xx</span><strong>{metric(historyHttp.status_5xx)}</strong></div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-observability-dashboard-grid">
      <LineChart series={series} valueKeys={latencyDefinitions('http', latencyView)} title={`Latencia API · ${latencyView === 'all' ? 'p50 / p95 / p99' : latencyView}`} suffix=" ms" resolution={resolution} />
      <LineChart series={series} valueKey="http_p99_ms" title="Cola alta · p99" suffix=" ms" resolution={resolution} />
      <BarChart series={series} valueKey="http_requests" title="Carga HTTP" resolution={resolution} />
      <div className="admin-observability-dashboard-kpis">
        <div><span>p50</span><strong>{metric(historyHttp.p50_ms, ' ms')}</strong></div>
        <div><span>p95</span><strong>{metric(historyHttp.p95_ms, ' ms')}</strong></div>
        <div><span>p99</span><strong>{metric(historyHttp.p99_ms, ' ms')}</strong></div>
        <div><span>5xx</span><strong>{metric(historyHttp.error_5xx_percent, '%')}</strong></div>
      </div>
    </div>
  );
}

function HistorySeries({ series = [], resolution = 'hour' }) {
  if (!series.length) return <p className="hint-text">Aún no hay histórico para este rango.</p>;
  const maxRequests = Math.max(1, ...series.map((row) => Number(row.http_requests || 0)));
  return (
    <div className="admin-observability-series" aria-label="Evolución de requests del rango">
      {series.map((row) => {
        const requests = Number(row.http_requests || 0);
        return (
          <div className="admin-observability-series-row" key={row.at}>
            <time>{seriesLabel(row.at, resolution)}</time>
            <span className="admin-observability-series-bar" aria-hidden="true"><span style={{ width: `${Math.max(2, (requests / maxRequests) * 100)}%` }} /></span>
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
  const [dashboardTab, setDashboardTab] = useState('health');
  const [latencyView, setLatencyView] = useState('all');
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [autoRefreshMs, setAutoRefreshMs] = useState(DEFAULT_OBSERVABILITY_AUTO_REFRESH_MS);
  const [aiSummary, setAiSummary] = useState(null);
  const [aiSummaryStatus, setAiSummaryStatus] = useState('idle');
  const userSummary = useMemo(() => summarizeAdminUsers(users, currentAdmin), [users, currentAdmin]);

  async function loadMetrics({ silent = false, activeCheck = () => true } = {}) {
    if (!silent) setLoading(true);
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
    const dossier = buildObservabilitySummaryDossier({ runtime, ai, rangeLabel: RANGE_LABELS[rangePreset] || 'rango' });
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
    return () => { active = false; };
  }, [token, rangePreset, customFrom, customTo]);

  useEffect(() => {
    if (!autoRefreshEnabled) return undefined;
    let active = true;
    const tick = () => {
      if (!document.hidden) void loadMetrics({ silent: true, activeCheck: () => active });
    };
    const timer = window.setInterval(tick, autoRefreshMs);
    const onVisibility = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [autoRefreshEnabled, autoRefreshMs, token, rangePreset, customFrom, customTo]);

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
        <div><span className="section-label">Observabilidad</span><h3>Estado de Chess Studio</h3></div>
        <span className={`admin-observability-health ${Number(hour.status_5xx || 0) > 0 || database?.status === 'down' ? 'is-warn' : ''}`}>
          {loading ? 'Midiendo…' : database?.status === 'down' ? 'Degradado' : 'Operativo'}
        </span>
      </div>

      <div className="admin-observability-range admin-observability-range-primary" aria-label="Rango temporal de observabilidad">
        <label>
          <span>Rango del dashboard</span>
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
        <div className="admin-observability-refresh-controls">
          <button type="button" className={autoRefreshEnabled ? 'secondary-btn active' : 'secondary-btn'} onClick={() => setAutoRefreshEnabled((value) => !value)}>{autoRefreshEnabled ? 'Auto-refresh ON' : 'Auto-refresh OFF'}</button>
          <label><span>Cada</span><select value={autoRefreshMs} disabled={!autoRefreshEnabled} onChange={(event) => setAutoRefreshMs(Number(event.target.value))}>{OBSERVABILITY_AUTO_REFRESH_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <button type="button" className="secondary-btn" disabled={loading} onClick={() => void refresh()}>{loading ? 'Actualizando…' : 'Actualizar ahora'}</button>
        </div>
        <small>{historyRange.persistent ? 'Histórico agregado en Mongo' : 'Histórico disponible sólo desde este proceso'} · resolución {historyRange.resolution === 'day' ? 'diaria' : 'horaria'}.</small>
      </div>

      <div className="admin-observability-summary">
        <div><span>API p95 · {rangeLabel}</span><strong>{metric(historyHttp.p95_ms, ' ms')}</strong></div>
        <div><span>Errores 5xx · {rangeLabel}</span><strong>{metric(historyHttp.error_5xx_percent, '%')}</strong></div>
        <div><span>Persistencia</span><strong>{databaseLabel(database)}</strong></div>
        <div><span>Workers AI · {rangeLabel}</span><strong>{historyAi.samples ? `${formatAiMetric(historyAi.cloudflare_percent, '%')} CF` : '—'}</strong></div>
      </div>

      <div className="admin-observability-dashboard" aria-label="Dashboards de observabilidad">
        <div className="admin-observability-dashboard-toolbar">
          <div className="admin-observability-dashboard-tabs" role="tablist" aria-label="Dashboard">
            {DASHBOARD_TABS.map((tab) => (
              <button key={tab.id} type="button" role="tab" aria-selected={dashboardTab === tab.id} className={dashboardTab === tab.id ? 'active' : ''} onClick={() => setDashboardTab(tab.id)}>{tab.label}</button>
            ))}
          </div>
          {dashboardTab !== 'traffic' ? <div className="admin-observability-percentile-picker" aria-label="Percentil de latencia">{LATENCY_VIEWS.map((view) => <button key={view} type="button" className={latencyView === view ? 'active' : ''} onClick={() => setLatencyView(view)}>{view === 'all' ? 'Todas' : view}</button>)}</div> : null}
        </div>
        <Dashboard tab={dashboardTab} history={history} historyHttp={historyHttp} historyAi={historyAi} historyRange={historyRange} latencyView={latencyView} />
      </div>

      <details className="friendly-disclosure admin-observability-details">
        <summary>Ver métricas completas</summary>
        <div className="friendly-disclosure-body admin-observability-body">
          <div className="admin-observability-toolbar">
            <p className="hint-text">Métricas técnicas agregadas. Sin jugadas, FEN, mensajes, clicks ni identidad sensible.</p>
            <div className="admin-observability-toolbar-actions">
              <button type="button" className="secondary-btn" disabled={loading || !runtime || aiSummaryStatus === 'loading'} onClick={() => void explainObservability()}>{aiSummaryStatus === 'loading' ? 'Interpretando…' : '¿Qué está pasando?'}</button>
              <button type="button" className="secondary-btn" disabled={loading} onClick={() => void refresh()}>{loading ? 'Actualizando…' : 'Actualizar'}</button>
            </div>
          </div>

          {aiSummaryStatus === 'loading' && <div className="ai-task-card admin-observability-ai-summary is-loading"><small>CPU // SRE AI</small><p>Mirando los números antes de culpar a Mongo por costumbre…</p></div>}
          {aiSummary && <div className="ai-task-card admin-observability-ai-summary"><small>CPU // SRE AI · WORKERS AI</small><p>{aiSummary}</p></div>}
          {aiSummaryStatus === 'unavailable' && <p className="hint-text">Workers AI no respondió; las métricas de abajo siguen siendo la fuente factual.</p>}

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
            <article><h4>Evolución de requests · {rangeLabel}</h4><HistorySeries series={history?.series || []} resolution={historyRange.resolution} /></article>
            <article><h4>Rutas más activas · {rangeLabel}</h4><ul className="admin-observability-list">{(historyHttp.top_routes || []).map((row) => (<li key={row.route}><span><code>{row.route}</code></span><strong>{row.requests} · p95 {metric(row.p95_ms, ' ms')}</strong></li>))}</ul></article>
            <article><h4>Eventos AI · {rangeLabel}</h4><KeyValueList values={historyAi.event_types} labels={EVENT_LABELS} /></article>
            <article><h4>Origen de peticiones AI · {rangeLabel}</h4><KeyValueList values={historyAi.request_kinds} labels={REQUEST_KIND_LABELS} /></article>
            <article><h4>Fallback / errores AI · {rangeLabel}</h4><KeyValueList values={Object.fromEntries(Object.entries(historyAi.reasons || {}).filter(([reason]) => String(reason).toLowerCase() !== 'ok'))} /></article>
            <article><h4>Detalle devuelto por Worker · {rangeLabel}</h4><KeyValueList values={historyAi.worker_errors} /></article>
            <article><h4>Releases en uso · ahora</h4><KeyValueList values={userSummary.releases} /></article>
            <article><h4>Modelos AI · {rangeLabel}</h4><KeyValueList values={historyAi.models} /></article>
          </div>
        </div>
      </details>
    </section>
  );
}
