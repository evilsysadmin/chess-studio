function boundedRows(value, limit = 5) {
  return Array.isArray(value) ? value.filter(Boolean).slice(-limit) : [];
}

export function buildMatthiasDeskArtifacts(memory = null) {
  if (!memory || typeof memory !== 'object') return [];
  const artifacts = [];
  const challenge = memory.activeChallenge;
  const fame = boundedRows(memory.hallOfFame);
  const shame = boundedRows(memory.hallOfShame);
  const relationship = memory.relationship || {};
  const respect = memory.respect || {};

  if (challenge?.label) {
    artifacts.push({ id: 'challenge', glyph: '⌖', label: 'Orden vigente', title: challenge.label });
  }
  if (fame.length) {
    const latest = fame.at(-1);
    artifacts.push({ id: 'fame', glyph: '✦', label: 'Condecoración', title: latest?.label || 'Hito ganado' });
  }
  if (shame.length) {
    const latest = shame.at(-1);
    artifacts.push({ id: 'shame', glyph: '▣', label: 'Expediente', title: latest?.label || 'Incidente archivado' });
  }
  if (respect.tier === 'formidable') {
    artifacts.push({ id: 'respect', glyph: '♜', label: 'Rival respetado', title: respect.label || 'Respeto ganado' });
  } else if (relationship.tier === 'veteran' && Number(relationship.games_seen || 0) > 0) {
    artifacts.push({ id: 'veteran', glyph: '▤', label: 'Archivo veterano', title: `${Number(relationship.games_seen)} partidas observadas` });
  }
  return artifacts.slice(0, 3);
}

export function buildMatthiasDossierEntries(memory = null, { limit = 6 } = {}) {
  if (!memory || typeof memory !== 'object') return [];
  const rows = boundedRows(memory.recentMilestones, Math.max(1, Number(limit) || 6));
  return rows.slice().reverse().map((item) => ({
    id: item.fingerprint || `${item.kind || 'hito'}:${item.at || item.label || ''}`,
    kind: item.kind || 'milestone',
    polarity: item.polarity === 'shame' ? 'shame' : 'fame',
    label: item.label || 'Hito sin descripción',
    at: item.at || null,
  }));
}

export function formatMatthiasDossierDate(value, locale = 'es-ES') {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}
