import { pieceRankForLevel } from './combatRanks.js';

// Expediente individual de cada identidad del ejército de Combate.
// Vive dentro del mismo roster para que backup/reset/sincronización sigan
// tratando al ejército como una sola unidad de estado. Nada de esto concede
// estadísticas: sólo documenta hechos ocurridos de verdad en batalla.

const MAX_PROCESSED_BATTLES = 120;
const MAX_MEMORIAL_ENTRIES = 96;

export const UNIT_DECORATIONS = Object.freeze([
  {
    id: 'baptism', short: 'BF', label: 'Bautismo de fuego',
    description: 'Sobrevivió a su primera batalla.',
    test: (stats) => stats.survivals >= 1,
  },
  {
    id: 'five_kills', short: '5B', label: 'Cinco bajas',
    description: 'Confirmó al menos 5 bajas enemigas.',
    test: (stats) => stats.kills >= 5,
  },
  {
    id: 'iron_streak', short: 'HIE', label: 'Hierro viejo',
    description: 'Encadenó 5 batallas seguidas sobreviviendo.',
    test: (stats) => stats.bestSurvivalStreak >= 5,
  },
  {
    id: 'veteran', short: 'VET', label: 'Veterano de campaña',
    description: 'Participó en 10 batallas y sobrevivió al menos 7.',
    test: (stats) => stats.battles >= 10 && stats.survivals >= 7,
  },
  {
    id: 'boss_survivor', short: 'BOSS', label: 'Cicatriz del Rey Viejo',
    description: 'Sobrevivió a una victoria contra un jefe.',
    test: (stats) => stats.bossVictories >= 1,
  },
  {
    id: 'ace', short: 'ACE', label: 'As de combate',
    description: 'Confirmó al menos 10 bajas enemigas.',
    test: (stats) => stats.kills >= 10,
  },
]);

function finiteNonNegative(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
}

function emptyStats() {
  return {
    battles: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    retirements: 0,
    survivals: 0,
    deaths: 0,
    revives: 0,
    kills: 0,
    bossDamage: 0,
    bossVictories: 0,
    bossFinishes: 0,
    currentSurvivalStreak: 0,
    bestSurvivalStreak: 0,
    lastDeathAt: null,
  };
}

function normalizeStats(input) {
  const stats = { ...emptyStats(), ...(input || {}) };
  for (const key of [
    'battles', 'wins', 'draws', 'losses', 'retirements', 'survivals', 'deaths', 'revives',
    'kills', 'bossDamage', 'bossVictories', 'bossFinishes', 'currentSurvivalStreak', 'bestSurvivalStreak',
  ]) {
    stats[key] = finiteNonNegative(stats[key]);
  }
  stats.lastDeathAt = typeof stats.lastDeathAt === 'string' ? stats.lastDeathAt : null;
  return stats;
}

function normalizeDecorations(input) {
  const seen = new Set();
  return (Array.isArray(input) ? input : [])
    .map((entry) => typeof entry === 'string' ? { id: entry, earnedAt: null } : entry)
    .filter((entry) => entry && typeof entry.id === 'string' && UNIT_DECORATIONS.some((d) => d.id === entry.id))
    .filter((entry) => {
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    })
    .map((entry) => ({ id: entry.id, earnedAt: typeof entry.earnedAt === 'string' ? entry.earnedAt : null }));
}

function addEligibleDecorations(record, earnedAt = null) {
  const known = new Set(record.decorations.map((entry) => entry.id));
  const decorations = [...record.decorations];
  for (const definition of UNIT_DECORATIONS) {
    if (!known.has(definition.id) && definition.test(record.stats)) {
      decorations.push({ id: definition.id, earnedAt });
    }
  }
  return { ...record, decorations };
}

function createRecord(identity, slotKey, nowIso) {
  const originType = String(slotKey || '').split('-')[0] || null;
  return {
    version: 1,
    identityId: identity.identityId,
    alias: identity.alias || 'Sin alias',
    slotKey,
    originType,
    createdAt: identity.createdAt || nowIso,
    lastBattleAt: null,
    stats: emptyStats(),
    decorations: [],
  };
}

function normalizeRecord(record, identity, slotKey, nowIso) {
  const base = createRecord(identity, slotKey, nowIso);
  return addEligibleDecorations({
    ...base,
    ...(record || {}),
    version: 1,
    identityId: identity.identityId,
    alias: identity.alias || record?.alias || 'Sin alias',
    slotKey,
    originType: record?.originType || base.originType,
    createdAt: typeof record?.createdAt === 'string' ? record.createdAt : base.createdAt,
    lastBattleAt: typeof record?.lastBattleAt === 'string' ? record.lastBattleAt : null,
    stats: normalizeStats(record?.stats),
    decorations: normalizeDecorations(record?.decorations),
  });
}

export function ensureUnitServiceState(rosterState, now = Date.now()) {
  const state = rosterState && typeof rosterState === 'object' ? rosterState : {};
  const identities = state.identities && typeof state.identities === 'object' ? state.identities : {};
  const currentRecords = state.unitRecords && typeof state.unitRecords === 'object' ? state.unitRecords : {};
  const unitRecords = { ...currentRecords };
  const nowIso = new Date(now).toISOString();
  let changed = !state.unitRecords || !Array.isArray(state.memorial) || !Array.isArray(state.unitServiceProcessedBattleIds);

  for (const [slotKey, identity] of Object.entries(identities)) {
    if (slotKey.startsWith('k-')) continue; // el rey tiene alias, pero no carrera militar individual
    if (!identity?.identityId) continue;
    const existing = unitRecords[identity.identityId];
    const normalized = normalizeRecord(existing, identity, slotKey, nowIso);
    if (!existing || JSON.stringify(existing) !== JSON.stringify(normalized)) changed = true;
    unitRecords[identity.identityId] = normalized;
  }

  const activeIds = new Set(Object.values(identities).map((entry) => entry?.identityId).filter(Boolean));
  // Un registro activo cuya identidad ya no existe sólo puede venir de una
  // migración/corte antiguo. No lo tiramos: lo dejamos intacto hasta que una
  // baja explícita lo archive; así no inventamos una fecha de muerte.
  for (const [identityId, record] of Object.entries(unitRecords)) {
    if (!activeIds.has(identityId) && record?.archived === true) {
      delete unitRecords[identityId];
      changed = true;
    }
  }

  const memorial = (Array.isArray(state.memorial) ? state.memorial : [])
    .filter((entry) => entry && typeof entry.identityId === 'string')
    .slice(-MAX_MEMORIAL_ENTRIES);
  const processed = (Array.isArray(state.unitServiceProcessedBattleIds) ? state.unitServiceProcessedBattleIds : [])
    .filter((id) => typeof id === 'string' && id)
    .slice(-MAX_PROCESSED_BATTLES);
  const memorialChanged = !Array.isArray(state.memorial)
    || memorial.length !== state.memorial.length
    || memorial.some((entry, index) => entry !== state.memorial[index]);
  const processedChanged = !Array.isArray(state.unitServiceProcessedBattleIds)
    || processed.length !== state.unitServiceProcessedBattleIds.length
    || processed.some((id, index) => id !== state.unitServiceProcessedBattleIds[index]);

  if (!changed && !memorialChanged && !processedChanged) return state;
  return { ...state, unitRecords, memorial, unitServiceProcessedBattleIds: processed };
}

export function unitRecordForKey(rosterState, slotKey) {
  const identityId = rosterState?.identities?.[slotKey]?.identityId;
  return identityId ? rosterState?.unitRecords?.[identityId] || null : null;
}

export function unitDecorations(record) {
  const earned = new Map((record?.decorations || []).map((entry) => [entry.id, entry]));
  return UNIT_DECORATIONS
    .filter((definition) => earned.has(definition.id))
    .map((definition) => ({ ...definition, earnedAt: earned.get(definition.id)?.earnedAt || null }));
}

export function recordUnitBattle(rosterState, event) {
  let state = ensureUnitServiceState(rosterState);
  const battleId = typeof event?.battleId === 'string' ? event.battleId : null;
  if (battleId && state.unitServiceProcessedBattleIds.includes(battleId)) return state;

  const date = typeof event?.date === 'string' ? event.date : new Date().toISOString();
  const participants = Array.isArray(event?.participants) ? event.participants : [];
  const survivors = new Set(Array.isArray(event?.survivorIdentityIds) ? event.survivorIdentityIds : []);
  const killsByIdentity = event?.killsByIdentity && typeof event.killsByIdentity === 'object' ? event.killsByIdentity : {};
  const bossDamageByIdentity = event?.bossDamageByIdentity && typeof event.bossDamageByIdentity === 'object' ? event.bossDamageByIdentity : {};
  const finisherId = typeof event?.bossFinisherIdentityId === 'string' ? event.bossFinisherIdentityId : null;
  const outcome = event?.outcome;
  const unitRecords = { ...state.unitRecords };

  for (const participant of participants) {
    if (!participant?.identityId) continue;
    const identity = {
      identityId: participant.identityId,
      alias: participant.alias || 'Sin alias',
      createdAt: participant.createdAt || date,
    };
    const slotKey = participant.slotKey || participant.key || '';
    let record = normalizeRecord(unitRecords[identity.identityId], identity, slotKey, date);
    const stats = { ...record.stats };
    stats.battles += 1;
    if (outcome === 'win') stats.wins += 1;
    else if (outcome === 'draw') stats.draws += 1;
    else if (outcome === 'loss') stats.losses += 1;
    else if (outcome === 'retired') stats.retirements += 1;

    stats.kills += finiteNonNegative(killsByIdentity[identity.identityId]);
    stats.bossDamage += finiteNonNegative(bossDamageByIdentity[identity.identityId]);
    if (finisherId === identity.identityId) stats.bossFinishes += 1;

    if (survivors.has(identity.identityId)) {
      stats.survivals += 1;
      stats.currentSurvivalStreak += 1;
      stats.bestSurvivalStreak = Math.max(stats.bestSurvivalStreak, stats.currentSurvivalStreak);
      if (event?.bossDefeated && outcome === 'win') stats.bossVictories += 1;
    } else {
      stats.deaths += 1;
      stats.currentSurvivalStreak = 0;
      stats.lastDeathAt = date;
    }

    record = addEligibleDecorations({ ...record, lastBattleAt: date, stats: normalizeStats(stats) }, date);
    unitRecords[identity.identityId] = record;
  }

  const processed = battleId
    ? [...state.unitServiceProcessedBattleIds.filter((id) => id !== battleId), battleId].slice(-MAX_PROCESSED_BATTLES)
    : state.unitServiceProcessedBattleIds;
  return { ...state, unitRecords, unitServiceProcessedBattleIds: processed };
}

export function recordUnitRevive(rosterState, slotKey, at = new Date().toISOString()) {
  const state = ensureUnitServiceState(rosterState);
  const identityId = state.identities?.[slotKey]?.identityId;
  const record = identityId ? state.unitRecords?.[identityId] : null;
  if (!record) return state;
  const unitRecords = {
    ...state.unitRecords,
    [identityId]: {
      ...record,
      lastBattleAt: record.lastBattleAt || at,
      stats: { ...record.stats, revives: finiteNonNegative(record.stats?.revives) + 1 },
    },
  };
  return { ...state, unitRecords };
}

export function archivePermanentCasualty(rosterState, slotKey, at = new Date().toISOString()) {
  const state = ensureUnitServiceState(rosterState);
  const identity = state.identities?.[slotKey];
  if (!identity?.identityId) return state;
  const record = state.unitRecords?.[identity.identityId];
  if (!record) return state;
  const piece = state.pieces?.[slotKey] || {};
  const finalLevel = 1 + finiteNonNegative(piece.strengthPoints) + finiteNonNegative(piece.speedPoints);
  const finalRank = pieceRankForLevel(finalLevel);
  const memorialEntry = {
    identityId: identity.identityId,
    alias: identity.alias || record.alias,
    slotKey,
    originType: record.originType || String(slotKey).split('-')[0] || null,
    createdAt: record.createdAt || identity.createdAt || null,
    diedAt: record.stats?.lastDeathAt || at,
    permanentDeathAt: at,
    finalLevel,
    finalRankId: finalRank.id,
    finalRankLabel: finalRank.label,
    stats: normalizeStats(record.stats),
    decorations: normalizeDecorations(record.decorations),
  };
  const unitRecords = { ...state.unitRecords };
  delete unitRecords[identity.identityId];
  const memorial = [
    ...(state.memorial || []).filter((entry) => entry.identityId !== identity.identityId),
    memorialEntry,
  ].slice(-MAX_MEMORIAL_ENTRIES);
  return { ...state, unitRecords, memorial };
}
