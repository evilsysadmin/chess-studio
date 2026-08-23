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


export function sortAdminUsers(users = []) {
  const ts = (value) => {
    if (!value) return 0;
    const date = value instanceof Date ? value : new Date(value);
    const time = date.getTime();
    return Number.isNaN(time) ? 0 : time;
  };
  return [...users].sort((a, b) => {
    const onlineDiff = Number(b?.presence === 'online') - Number(a?.presence === 'online');
    if (onlineDiff) return onlineDiff;
    const activityDiff = ts(b?.lastActivity) - ts(a?.lastActivity);
    if (activityDiff) return activityDiff;
    return String(a?.username || '').localeCompare(String(b?.username || ''), 'es');
  });
}
