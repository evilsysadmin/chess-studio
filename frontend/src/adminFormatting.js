const ADMIN_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const ADMIN_DATE_FORMATTER = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function validDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatAdminTimestamp(value, fallback = '—') {
  const date = validDate(value);
  if (!date) return fallback;
  const parts = Object.fromEntries(ADMIN_DATE_TIME_FORMATTER.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.day}/${parts.month}/${parts.year} · ${parts.hour}:${parts.minute}:${parts.second}`;
}

export function formatAdminDate(value, fallback = '—') {
  const date = validDate(value);
  return date ? ADMIN_DATE_FORMATTER.format(date) : fallback;
}


export const ADMIN_USER_FILTERS = Object.freeze([
  { id: 'all', label: 'Todos' },
  { id: 'foreground', label: 'Primer plano' },
  { id: 'online', label: 'En línea' },
  { id: 'idle', label: 'Inactivos' },
  { id: 'game', label: 'Partida' },
  { id: 'combat', label: 'Combat Chess' },
  { id: 'tournament', label: 'Torneo' },
  { id: 'insights', label: 'Así juegas' },
]);

function matchesAdminUserFilter(user, filter = 'all') {
  if (filter === 'all') return true;
  if (filter === 'foreground') return user?.foreground === true;
  if (filter === 'online') return user?.presence === 'online';
  if (filter === 'idle') return user?.presence === 'idle';
  const activity = String(user?.currentActivity || '');
  const activityIsFresh = ['online', 'idle', 'recent'].includes(user?.presence);
  if (filter === 'game') return activityIsFresh && (activity === 'Partida' || activity === 'Partida rápida');
  if (filter === 'combat') return activityIsFresh && activity === 'Combat Chess';
  if (filter === 'tournament') return activityIsFresh && activity === 'Torneo';
  if (filter === 'insights') return activityIsFresh && activity === 'Así juegas';
  return true;
}

export function filterAdminUsers(users = [], filter = 'all') {
  return users.filter((user) => matchesAdminUserFilter(user, filter));
}

export function sortAdminUsers(users = []) {
  const ts = (value) => {
    if (!value) return 0;
    const date = value instanceof Date ? value : new Date(value);
    const time = date.getTime();
    return Number.isNaN(time) ? 0 : time;
  };
  const presenceRank = { online: 4, idle: 3, recent: 2, offline: 1, never: 0 };
  return [...users].sort((a, b) => {
    const foregroundDiff = Number(b?.foreground === true) - Number(a?.foreground === true);
    if (foregroundDiff) return foregroundDiff;
    const presenceDiff = (presenceRank[b?.presence] || 0) - (presenceRank[a?.presence] || 0);
    if (presenceDiff) return presenceDiff;
    const activityDiff = ts(b?.lastActivity) - ts(a?.lastActivity);
    if (activityDiff) return activityDiff;
    return String(a?.username || '').localeCompare(String(b?.username || ''), 'es');
  });
}


function parseDmRelease(value) {
  const match = /^v(\d+)\.(\d+)dm(\d+)([a-z]?)$/i.exec(String(value || '').trim());
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), dm: Number(match[3]), suffix: match[4].toLowerCase() };
}

function compareReleaseParts(a, b) {
  for (const key of ['major', 'minor', 'dm']) {
    if (a[key] !== b[key]) return a[key] - b[key];
  }
  return a.suffix.localeCompare(b.suffix);
}

export function adminClientReleaseState(clientRelease, currentRelease) {
  if (!clientRelease) return { id: 'unknown', label: 'Sin dato' };
  if (clientRelease === currentRelease) return { id: 'current', label: 'Actual' };
  const client = parseDmRelease(clientRelease);
  const current = parseDmRelease(currentRelease);
  if (!client || !current) return { id: 'different', label: 'Distinta' };
  const cmp = compareReleaseParts(client, current);
  if (cmp < 0) return { id: 'outdated', label: 'Antigua' };
  if (cmp > 0) return { id: 'newer', label: 'Más nueva' };
  return { id: 'different', label: 'Distinta' };
}


export function summarizeAdminClientReleases(users = [], currentAdmin = null, currentRelease = '') {
  const counts = { current: 0, outdated: 0, newer: 0, different: 0, unknown: 0 };
  for (const user of users || []) {
    if (user?.username === currentAdmin) continue;
    const state = adminClientReleaseState(user?.clientRelease, currentRelease).id;
    counts[state] = (counts[state] || 0) + 1;
  }
  return counts;
}


const ADMIN_ACTIVITY_TYPE_LABELS = Object.freeze({
  'contract-loss': 'Reto fallido',
  'contract-win': 'Reto cumplido',
  combat: 'Combat Chess',
  tournament: 'Torneo',
  practice: 'Práctica',
  casual: 'Partida',
  ghost: 'Rival fantasma',
  'nemesis-training': 'Némesis',
  sudden: 'Muerte súbita',
  season: 'Temporada',
  cup: 'Copa',
  record: 'Récord',
});

export function adminActivityTypeLabel(activity = {}) {
  const explicit = String(activity?.modeLabel || '').trim();
  if (explicit) return explicit;
  const type = String(activity?.type || '').trim();
  if (!type) return 'Actividad';
  if (ADMIN_ACTIVITY_TYPE_LABELS[type]) return ADMIN_ACTIVITY_TYPE_LABELS[type];
  const humanized = type.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return humanized ? humanized.charAt(0).toUpperCase() + humanized.slice(1) : 'Actividad';
}
