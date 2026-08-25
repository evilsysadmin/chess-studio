import { unitDecorations, unitRecordForKey } from './combatUnitService.js';

function scoreRecord(record) {
  const stats = record?.stats || {};
  return Number(stats.bossVictories || 0) * 20
    + Number(stats.kills || 0) * 4
    + Number(stats.survivals || 0) * 2
    + Number(stats.battles || 0)
    + unitDecorations(record).length * 3;
}

// Resumen intencionadamente pequeño del ejército persistente. Sólo agrega
// hechos ya almacenados; no concede rangos, XP ni medallas nuevas.
export function combatArmyGlance(roster) {
  const pieces = roster?.pieces && typeof roster.pieces === 'object' ? roster.pieces : {};
  const alive = Object.entries(pieces).filter(([key, piece]) => !key.startsWith('k-') && piece?.alive !== false);
  const rows = alive.map(([key]) => ({ key, record: unitRecordForKey(roster, key) })).filter((row) => row.record);
  const experienced = rows.filter(({ record }) => Number(record?.stats?.battles || 0) > 0);
  const decorated = rows.filter(({ record }) => unitDecorations(record).length > 0);
  const standoutRow = [...experienced].sort((a, b) => scoreRecord(b.record) - scoreRecord(a.record))[0] || null;
  const standout = standoutRow ? {
    key: standoutRow.key,
    alias: standoutRow.record.alias || roster?.identities?.[standoutRow.key]?.alias || 'Sin alias',
    battles: Number(standoutRow.record?.stats?.battles || 0),
    survivals: Number(standoutRow.record?.stats?.survivals || 0),
    kills: Number(standoutRow.record?.stats?.kills || 0),
    bossVictories: Number(standoutRow.record?.stats?.bossVictories || 0),
    decorations: unitDecorations(standoutRow.record).length,
  } : null;

  return {
    active: alive.length,
    experienced: experienced.length,
    decorated: decorated.length,
    memorial: Array.isArray(roster?.memorial) ? roster.memorial.length : 0,
    standout,
  };
}
