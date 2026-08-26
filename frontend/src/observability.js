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
      headers: { Authorization: `Bearer ${token}` },
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
