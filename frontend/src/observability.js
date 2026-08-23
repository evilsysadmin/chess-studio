function apiBase() {
  return String(import.meta.env?.VITE_API_URL || 'http://localhost:4000/api').replace(/\/$/, '');
}

export async function fetchAdminObservability({ token, fetchImpl = fetch } = {}) {
  if (!token) return null;
  try {
    const response = await fetchImpl(`${apiBase()}/admin/observability`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const body = await response.json();
    return body && typeof body === 'object' ? body : null;
  } catch {
    return null;
  }
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
