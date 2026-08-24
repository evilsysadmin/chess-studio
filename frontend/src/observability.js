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
    online: rows.filter((user) => user?.presence === 'online').length,
    idle: rows.filter((user) => user?.presence === 'idle').length,
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
