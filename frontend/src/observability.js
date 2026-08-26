import { withRequestId } from './requestId.js';

function apiBase() {
  return String(import.meta.env?.VITE_API_URL || 'http://localhost:4000/api').replace(/\/$/, '');
}

export async function fetchAdminObservability({ token, from = null, to = null, fetchImpl = fetch } = {}) {
  if (!token) return null;
  try {
    const params = new URLSearchParams();
    if (from) params.set('from_time', String(from));
    if (to) params.set('to_time', String(to));
    const suffix = params.size ? `?${params.toString()}` : '';
    const response = await fetchImpl(`${apiBase()}/admin/observability${suffix}`, {
      headers: withRequestId({ Authorization: `Bearer ${token}` }),
    });
    if (!response.ok) return null;
    const body = await response.json();
    return body && typeof body === 'object' ? body : null;
  } catch {
    return null;
  }
}

export function observabilityRangeForPreset(preset = '24h', customFrom = '', customTo = '', now = new Date()) {
  const end = new Date(now);
  if (Number.isNaN(end.getTime())) return { from: null, to: null };

  if (preset === 'custom') {
    if (!customFrom || !customTo) return { from: null, to: null };
    const start = new Date(`${customFrom}T00:00:00`);
    const inclusiveEnd = new Date(`${customTo}T23:59:59.999`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(inclusiveEnd.getTime()) || inclusiveEnd <= start) {
      return { from: null, to: null };
    }
    return { from: start.toISOString(), to: inclusiveEnd.toISOString() };
  }

  const durations = {
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '2h': 2 * 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  };
  const duration = durations[preset] || durations['24h'];
  return {
    from: new Date(end.getTime() - duration).toISOString(),
    to: end.toISOString(),
  };
}

export function summarizeAdminUsers(users = [], currentAdmin = null) {
  const rows = (users || []).filter((user) => user?.username !== currentAdmin);
  const releases = {};
  let totalGames = 0;
  let combatBattles = 0;
  for (const user of rows) {
    totalGames += Number(user?.totalGames || 0);
    combatBattles += Number(user?.combatBattles || 0);
    const release = String(user?.clientRelease || 'Sin dato');
    releases[release] = (releases[release] || 0) + 1;
  }
  return {
    registered: rows.length,
    foreground: rows.filter((user) => user?.foreground === true).length,
    online: rows.filter((user) => user?.presence === 'online' && user?.foreground === true).length,
    idle: rows.filter((user) => user?.presence === 'idle' || (user?.presence === 'online' && user?.foreground === false)).length,
    totalGames,
    combatBattles,
    releases,
  };
}

export function formatDuration(seconds) {
  if (seconds == null || Number.isNaN(Number(seconds))) return '—';
  const value = Math.max(0, Number(seconds));
  if (value < 60) return `${Math.round(value)} s`;
  const minutes = Math.floor(value / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (hours < 24) return remMinutes ? `${hours} h ${remMinutes} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} d ${hours % 24} h`;
}

export function observabilitySampleQuality(samples, minimum = 20) {
  const count = Number(samples);
  const min = Math.max(1, Number(minimum) || 1);
  if (!Number.isFinite(count) || count <= 0) return { level: 'none', label: 'Sin datos suficientes', samples: 0, minimum: min };
  if (count < min) return { level: 'low', label: `Muestra baja · ${count}/${min}`, samples: count, minimum: min };
  return { level: 'enough', label: `${count} muestras`, samples: count, minimum: min };
}


export const PRODUCT_SLOS = Object.freeze({
  availabilityPercent: 99.5,
  apiP95Ms: 750,
});

export function evaluateProductSlos(runtime, targets = PRODUCT_SLOS) {
  const http = runtime?.history?.http || runtime?.http?.last_1h || {};
  const error5xxPercent = Number(http.error_5xx_percent);
  const p95Ms = Number(http.p95_ms);
  const samples = Number(http.samples);
  const availabilityPercent = Number.isFinite(error5xxPercent) ? Math.max(0, 100 - error5xxPercent) : null;
  const enoughData = Number.isFinite(samples) ? samples >= 20 : (availabilityPercent != null || Number.isFinite(p95Ms));
  const availabilityMet = availabilityPercent == null ? null : availabilityPercent >= Number(targets.availabilityPercent);
  const latencyMet = !Number.isFinite(p95Ms) ? null : p95Ms <= Number(targets.apiP95Ms);
  const checks = [availabilityMet, latencyMet].filter((value) => value !== null);
  const met = checks.length > 0 && checks.every(Boolean);
  const status = !enoughData || checks.length === 0 ? 'unknown' : met ? 'met' : 'missed';
  return {
    status,
    statusLabel: status === 'met' ? 'SLO cumplido' : status === 'missed' ? 'SLO en riesgo' : 'SLO sin muestra',
    availabilityPercent,
    availabilityTarget: Number(targets.availabilityPercent),
    availabilityMet,
    apiP95Ms: Number.isFinite(p95Ms) ? p95Ms : null,
    apiP95TargetMs: Number(targets.apiP95Ms),
    latencyMet,
    samples: Number.isFinite(samples) ? samples : null,
  };
}


export function errorBudgetForSlo(runtime, targets = PRODUCT_SLOS) {
  const http = runtime?.history?.http || runtime?.http?.last_1h || {};
  const samples = Number(http.samples);
  const errors = Number(http.status_5xx);
  const target = Number(targets.availabilityPercent);
  if (!Number.isFinite(samples) || samples < 20 || !Number.isFinite(errors) || !Number.isFinite(target) || target >= 100) {
    return { status: 'unknown', statusLabel: 'Sin muestra', consumedPercent: null, remainingPercent: null, allowedErrors: null, errors: Number.isFinite(errors) ? errors : null, samples: Number.isFinite(samples) ? samples : null };
  }
  const allowedErrors = samples * ((100 - target) / 100);
  const consumedPercent = allowedErrors > 0 ? (errors / allowedErrors) * 100 : null;
  const remainingPercent = consumedPercent == null ? null : Math.max(0, 100 - consumedPercent);
  const status = consumedPercent == null ? 'unknown' : consumedPercent > 100 ? 'exhausted' : consumedPercent >= 50 ? 'watch' : 'healthy';
  return {
    status,
    statusLabel: status === 'exhausted' ? 'Agotado' : status === 'watch' ? 'Vigilar' : status === 'healthy' ? 'Con margen' : 'Sin muestra',
    consumedPercent: consumedPercent == null ? null : Math.round(consumedPercent * 10) / 10,
    remainingPercent: remainingPercent == null ? null : Math.round(remainingPercent * 10) / 10,
    allowedErrors: Math.round(allowedErrors * 100) / 100,
    errors,
    samples,
  };
}

export function evaluateReleaseHealth(runtime, currentRelease, targets = PRODUCT_SLOS) {
  const rows = runtime?.history?.http?.releases || runtime?.http?.last_1h?.releases || [];
  const release = String(currentRelease || '').trim();
  const current = rows.find((row) => row?.release === release) || null;
  if (!current || Number(current.requests) < 20) {
    return { status: 'unknown', statusLabel: 'Sin muestra', release, requests: Number(current?.requests || 0), error5xxPercent: current?.error_5xx_percent ?? null, p95Ms: current?.p95_ms ?? null, baseline: null };
  }
  const others = rows.filter((row) => row?.release && row.release !== release && Number(row.requests) > 0);
  const otherRequests = others.reduce((sum, row) => sum + Number(row.requests || 0), 0);
  const baselineError = otherRequests ? others.reduce((sum, row) => sum + Number(row.error_5xx_percent || 0) * Number(row.requests || 0), 0) / otherRequests : null;
  const baselineP95 = otherRequests ? others.reduce((sum, row) => sum + Number(row.p95_ms || 0) * Number(row.requests || 0), 0) / otherRequests : null;
  const errorPercent = Number(current.error_5xx_percent || 0);
  const p95Ms = Number(current.p95_ms);
  const hasBaseline = otherRequests >= 20;
  const missesAvailability = errorPercent > (100 - Number(targets.availabilityPercent));
  const missesLatency = Number.isFinite(p95Ms) && p95Ms > Number(targets.apiP95Ms);
  const errorRegression = hasBaseline && baselineError != null
    && errorPercent > Math.max(baselineError + 0.5, baselineError * 2);
  const latencyRegression = hasBaseline && baselineP95 != null && Number.isFinite(p95Ms)
    && p95Ms > Math.max(Number(targets.apiP95Ms), baselineP95 * 1.5);
  const status = errorRegression || latencyRegression
    ? 'regression'
    : missesAvailability || missesLatency
      ? 'degraded'
      : 'healthy';
  return {
    status,
    statusLabel: status === 'regression' ? 'Regresión probable' : status === 'degraded' ? 'Fuera de SLO' : 'Saludable',
    release,
    requests: Number(current.requests),
    error5xxPercent: errorPercent,
    p95Ms: Number.isFinite(p95Ms) ? p95Ms : null,
    baseline: hasBaseline ? { requests: otherRequests, error5xxPercent: baselineError, p95Ms: baselineP95 } : null,
  };
}

export function summarizeObservabilityHealth(runtime, users = [], currentAdmin = null) {
  const historyHttp = runtime?.history?.http || {};
  const historyAi = runtime?.history?.ai || {};
  const database = runtime?.database || null;
  const userSummary = summarizeAdminUsers(users, currentAdmin);
  const error5xxPercent = Number(historyHttp.error_5xx_percent);
  const apiP95Ms = Number(historyHttp.p95_ms);
  const databaseDown = database?.status === 'down';
  const degraded = databaseDown || (Number.isFinite(error5xxPercent) && error5xxPercent > 0);
  const hasRuntime = Boolean(runtime);
  return {
    status: hasRuntime ? (degraded ? 'degraded' : 'operational') : 'unknown',
    statusLabel: hasRuntime ? (degraded ? 'Degradado' : 'Operativo') : 'Sin datos',
    apiP95Ms: Number.isFinite(apiP95Ms) ? apiP95Ms : null,
    error5xxPercent: Number.isFinite(error5xxPercent) ? error5xxPercent : null,
    databaseLabel: !database ? 'Sin datos' : database.status === 'ok' ? 'Mongo OK' : database.status === 'memory' ? 'Memoria local' : 'Mongo DOWN',
    aiCloudflarePercent: Number.isFinite(Number(historyAi.cloudflare_percent)) ? Number(historyAi.cloudflare_percent) : null,
    onlineUsers: userSummary.online,
  };
}
