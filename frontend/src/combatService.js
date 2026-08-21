import { setProfileStorageItem, removeProfileStorageItem } from './profileKeys.js';

// Hoja de servicio de Combate.
//
// A diferencia del XP de piezas o del XP de combate, esto NO es una moneda.
// Resume hechos reales y persistentes: batallas terminadas, victorias,
// supervivientes, pisos Roguelike superados y bosses derrotados. El rango se
// deriva de esos datos y no concede ninguna ventaja jugable.

const KEY = 'chess-study-combat-service';
const HISTORY_KEY = 'chess-study-combat-history';
const BEST_FLOOR_KEY = 'chess-study-roguelike-best-floor';
const TOWER_COMPLETED_KEY = 'chess-study-roguelike-tower-completed';
const ROSTER_KEY = 'chess-study-combat-roster';
const MAX_PROCESSED_IDS = 160;

export const COMBAT_RANKS = [
  { id: 'recruit', label: 'Recluta', insignia: '·', minMerit: 0, eligible: () => true },
  { id: 'soldier', label: 'Soldado', insignia: 'Ⅰ', minMerit: 8, eligible: (s) => s.wins >= 1 },
  { id: 'corporal', label: 'Cabo', insignia: 'Ⅱ', minMerit: 20, eligible: (s) => s.wins >= 3 },
  { id: 'sergeant', label: 'Sargento', insignia: 'Ⅲ', minMerit: 40, eligible: (s) => s.wins >= 6 },
  { id: 'second-lieutenant', label: 'Subteniente', insignia: '◇', minMerit: 65, eligible: (s) => s.wins >= 10 },
  { id: 'lieutenant', label: 'Teniente', insignia: '◇◇', minMerit: 95, eligible: (s) => s.wins >= 14 || s.highestFloorCleared >= 5 },
  { id: 'captain', label: 'Capitán', insignia: '★', minMerit: 135, eligible: (s) => s.wins >= 20 || s.highestFloorCleared >= 5 },
  { id: 'commander', label: 'Comandante', insignia: '★★', minMerit: 185, eligible: (s) => s.wins >= 30 || s.highestFloorCleared >= 9 },
  { id: 'colonel', label: 'Coronel', insignia: '★★★', minMerit: 250, eligible: (s) => s.wins >= 45 || s.towerCompletions >= 1 },
  {
    id: 'general',
    label: 'General',
    insignia: '★★★★',
    minMerit: 350,
    eligible: (s) => s.wins >= 60 || (s.towerCompletions >= 1 && s.highestFloorCleared >= 15),
  },
];

export const COMBAT_DECORATIONS = [
  { id: 'first-sortie', label: 'Bautismo de fuego', short: 'FUEGO', description: 'Completa tu primera batalla de Combate.', test: (s) => s.battles >= 1 },
  { id: 'first-win', label: 'Primera victoria', short: 'VICTORIA', description: 'Gana tu primera batalla de Combate.', test: (s) => s.wins >= 1 },
  { id: 'no-casualties', label: 'Sin bajas', short: '16/16', description: 'Gana una batalla con las 16 piezas en pie.', test: (s) => s.flawlessWins >= 1 },
  { id: 'under-fire', label: 'Bajo fuego', short: '≤6', description: 'Gana una batalla con 6 piezas o menos en pie.', test: (s) => s.hardshipWins >= 1 },
  { id: 'five-streak', label: 'Línea mantenida', short: 'RACHA 5', description: 'Encadena 5 victorias de Combate.', test: (s) => s.bestWinStreak >= 5 },
  { id: 'veteran-25', label: 'Veterano de campaña', short: '25', description: 'Completa 25 batallas de Combate.', test: (s) => s.battles >= 25 },
  { id: 'veteran-squad', label: 'Pelotón veterano', short: '8 VET', description: 'Mantén 8 piezas supervivientes con al menos una mejora comprada.', test: (s) => s.maxVeteranPieces >= 8 },
  { id: 'elite-piece', label: 'Guardia de élite', short: 'NV.6+', description: 'Conserva al menos una pieza veterana de nivel 6 o superior.', test: (s) => s.maxElitePieces >= 1 },
  { id: 'old-guard', label: 'Vieja guardia', short: '12 VET', description: 'Mantén 12 piezas supervivientes con veteranía real.', test: (s) => s.maxVeteranPieces >= 12 },
  { id: 'tower-3', label: 'Primer ascenso', short: 'PISO 3', description: 'Supera el piso 3 de La Torre.', test: (s) => s.highestFloorCleared >= 3 },
  { id: 'tower-5', label: 'Mitad de la Torre', short: 'PISO 5', description: 'Supera el piso 5 de La Torre.', test: (s) => s.highestFloorCleared >= 5 },
  { id: 'tower-9', label: 'A las puertas', short: 'PISO 9', description: 'Supera el piso 9 de La Torre.', test: (s) => s.highestFloorCleared >= 9 },
  { id: 'king-slayer', label: 'Cazador de reyes', short: 'BOSS', description: 'Derrota a un Rey Boss.', test: (s) => s.bossesDefeated >= 1 },
  { id: 'tower-complete', label: 'Cruz de la Torre', short: '10/10', description: 'Completa los 10 pisos de La Torre.', test: (s) => s.towerCompletions >= 1 },
  { id: 'endless-15', label: 'Más allá del deber', short: 'PISO 15', description: 'Supera el piso 15 en modo infinito.', test: (s) => s.highestFloorCleared >= 15 },
  { id: 'endless-20', label: 'Hierro negro', short: 'PISO 20', description: 'Supera el piso 20 en modo infinito.', test: (s) => s.highestFloorCleared >= 20 },
];

function emptyStats() {
  return {
    battles: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    retirements: 0,
    totalSurvivors: 0,
    survivorSamples: 0,
    flawlessWins: 0,
    hardshipWins: 0,
    currentWinStreak: 0,
    bestWinStreak: 0,
    roguelikeFloorsCleared: 0,
    highestFloorCleared: 0,
    bossesDefeated: 0,
    towerCompletions: 0,
    endlessFloorsCleared: 0,
    maxVeteranPieces: 0,
    maxElitePieces: 0,
  };
}

function emptyRecord() {
  return {
    version: 1,
    stats: emptyStats(),
    decorations: [],
    processedBattleIds: [],
    migratedLegacyHistory: false,
  };
}

function finiteNonNegative(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function normalizeStats(stats) {
  const base = emptyStats();
  const out = {};
  for (const key of Object.keys(base)) out[key] = Math.floor(finiteNonNegative(stats?.[key], base[key]));
  return out;
}

function normalizeRecord(raw) {
  const base = emptyRecord();
  if (!raw || typeof raw !== 'object') return base;
  const decorations = Array.isArray(raw.decorations)
    ? raw.decorations
        .filter((d) => d && COMBAT_DECORATIONS.some((def) => def.id === d.id))
        .map((d) => ({ id: d.id, earnedAt: typeof d.earnedAt === 'string' ? d.earnedAt : null }))
    : [];
  const processedBattleIds = Array.isArray(raw.processedBattleIds)
    ? raw.processedBattleIds.filter((id) => typeof id === 'string' && id).slice(-MAX_PROCESSED_IDS)
    : [];
  return {
    version: 1,
    stats: normalizeStats(raw.stats),
    decorations,
    processedBattleIds,
    migratedLegacyHistory: raw.migratedLegacyHistory === true,
  };
}

function safeJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function streaksFromHistory(history) {
  let current = 0;
  let best = 0;
  const chronological = [...history].sort((a, b) => new Date(a?.date || 0) - new Date(b?.date || 0));
  for (const battle of chronological) {
    if (battle?.outcome === 'win') {
      current += 1;
      best = Math.max(best, current);
    } else if (['draw', 'loss', 'retired'].includes(battle?.outcome)) {
      current = 0;
    }
  }
  return { current, best };
}

function addEligibleDecorations(record, earnedAt = null) {
  const known = new Set(record.decorations.map((d) => d.id));
  const decorations = [...record.decorations];
  for (const def of COMBAT_DECORATIONS) {
    if (!known.has(def.id) && def.test(record.stats)) decorations.push({ id: def.id, earnedAt });
  }
  return { ...record, decorations };
}

function migrateLegacyRecord() {
  const history = safeJson(HISTORY_KEY, []);
  const battles = Array.isArray(history) ? history : [];
  const stats = emptyStats();
  const processedBattleIds = [];

  for (const battle of battles) {
    if (typeof battle?.id === 'string') processedBattleIds.push(battle.id);
    if (battle?.outcome === 'retired') {
      stats.retirements += 1;
      continue;
    }
    if (!['win', 'draw', 'loss'].includes(battle?.outcome)) continue;
    stats.battles += 1;
    if (battle.outcome === 'win') stats.wins += 1;
    else if (battle.outcome === 'draw') stats.draws += 1;
    else stats.losses += 1;

    if (Number.isFinite(Number(battle.survivorCount))) {
      const survivors = Math.max(0, Math.min(16, Math.floor(Number(battle.survivorCount))));
      stats.totalSurvivors += survivors;
      stats.survivorSamples += 1;
      if (battle.outcome === 'win' && survivors === 16) stats.flawlessWins += 1;
      if (battle.outcome === 'win' && survivors <= 6) stats.hardshipWins += 1;
    }

    if (battle.variant === 'roguelike' && battle.outcome === 'win') {
      stats.roguelikeFloorsCleared += 1;
      const floor = Math.max(0, Math.floor(finiteNonNegative(battle.roguelikeFloor, 0)));
      stats.highestFloorCleared = Math.max(stats.highestFloorCleared, floor);
      if (floor > 10) stats.endlessFloorsCleared += 1;
    }
    if (battle.outcome === 'win' && battle.boss) stats.bossesDefeated += 1;
    if (battle.outcome === 'win' && battle.boss && Number(battle.roguelikeFloor) === 10) stats.towerCompletions += 1;
  }

  // Recupera también la veteranía ACTUAL del ejército. No intenta reconstruir
  // niveles históricos ya perdidos: sólo reconoce evidencia que todavía existe.
  const legacyRoster = safeJson(ROSTER_KEY, { pieces: {} });
  const rosterPieces = legacyRoster && typeof legacyRoster === 'object' && legacyRoster.pieces && typeof legacyRoster.pieces === 'object'
    ? Object.values(legacyRoster.pieces)
    : [];
  stats.maxVeteranPieces = rosterPieces.filter((piece) => piece?.alive !== false && ((piece?.strengthPoints || 0) + (piece?.speedPoints || 0)) >= 1).length;
  stats.maxElitePieces = rosterPieces.filter((piece) => piece?.alive !== false && (1 + (piece?.strengthPoints || 0) + (piece?.speedPoints || 0)) >= 6).length;

  const legacyBestFloor = Math.max(0, Number.parseInt(localStorage.getItem(BEST_FLOOR_KEY) || '0', 10) || 0);
  const towerCompleted = localStorage.getItem(TOWER_COMPLETED_KEY) === '1';
  // `bestFloor` histórico significa "piso alcanzado", no necesariamente ganado.
  // Para no regalar méritos, sólo damos por superado `bestFloor - 1`, salvo que
  // exista la marca explícita de Torre completada.
  const conservativelyCleared = towerCompleted ? Math.max(10, legacyBestFloor - 1) : Math.max(0, legacyBestFloor - 1);
  stats.highestFloorCleared = Math.max(stats.highestFloorCleared, conservativelyCleared);
  stats.roguelikeFloorsCleared = Math.max(stats.roguelikeFloorsCleared, Math.min(10, conservativelyCleared));
  stats.endlessFloorsCleared = Math.max(stats.endlessFloorsCleared, Math.max(0, conservativelyCleared - 10));
  if (towerCompleted) stats.towerCompletions = Math.max(stats.towerCompletions, 1);

  const streak = streaksFromHistory(battles);
  stats.currentWinStreak = streak.current;
  stats.bestWinStreak = streak.best;

  return addEligibleDecorations({
    version: 1,
    stats,
    decorations: [],
    processedBattleIds: processedBattleIds.slice(-MAX_PROCESSED_IDS),
    migratedLegacyHistory: true,
  });
}

export function meritForStats(stats) {
  const s = normalizeStats(stats);
  return (
    s.battles +
    s.wins * 3 +
    s.draws +
    s.flawlessWins * 2 +
    s.hardshipWins * 3 +
    s.roguelikeFloorsCleared * 2 +
    s.bossesDefeated * 8 +
    s.towerCompletions * 10 +
    s.endlessFloorsCleared * 2
  );
}

export function rankForService(recordOrStats) {
  const stats = normalizeStats(recordOrStats?.stats || recordOrStats);
  const merit = meritForStats(stats);
  let rank = COMBAT_RANKS[0];
  for (const candidate of COMBAT_RANKS) {
    if (merit >= candidate.minMerit && candidate.eligible(stats)) rank = candidate;
  }
  return rank;
}

function requirementText(rank) {
  switch (rank.id) {
    case 'soldier': return '1 victoria';
    case 'corporal': return '3 victorias';
    case 'sergeant': return '6 victorias';
    case 'second-lieutenant': return '10 victorias';
    case 'lieutenant': return '14 victorias o piso 5';
    case 'captain': return '20 victorias o piso 5';
    case 'commander': return '30 victorias o piso 9';
    case 'colonel': return '45 victorias o completar la Torre';
    case 'general': return '60 victorias o Torre + piso 15';
    default: return '';
  }
}

export function summarizeCombatService(record) {
  const normalized = normalizeRecord(record);
  const stats = normalized.stats;
  const merit = meritForStats(stats);
  const rank = rankForService(stats);
  const index = COMBAT_RANKS.findIndex((r) => r.id === rank.id);
  const nextRank = index >= 0 && index < COMBAT_RANKS.length - 1 ? COMBAT_RANKS[index + 1] : null;
  const nextProgress = nextRank
    ? Math.max(0, Math.min(1, (merit - rank.minMerit) / Math.max(1, nextRank.minMerit - rank.minMerit)))
    : 1;
  const decorations = normalized.decorations
    .map((earned) => {
      const def = COMBAT_DECORATIONS.find((d) => d.id === earned.id);
      return def ? { ...def, earnedAt: earned.earnedAt } : null;
    })
    .filter(Boolean);
  return {
    record: normalized,
    stats,
    merit,
    rank,
    nextRank,
    nextProgress,
    nextRequirement: nextRank ? requirementText(nextRank) : 'Rango máximo alcanzado',
    decorations,
    averageSurvivors: stats.survivorSamples > 0 ? stats.totalSurvivors / stats.survivorSamples : null,
  };
}

export function loadCombatService() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalizeRecord(JSON.parse(raw));
  } catch {
    // Cae a migración conservadora.
  }
  const migrated = migrateLegacyRecord();
  setProfileStorageItem(KEY, JSON.stringify(migrated));
  return migrated;
}

export function recordCombatServiceEvent(event) {
  const current = loadCombatService();
  const battleId = typeof event?.battleId === 'string' && event.battleId ? event.battleId : null;
  if (battleId && current.processedBattleIds.includes(battleId)) {
    const summary = summarizeCombatService(current);
    return { record: current, previousRank: summary.rank, currentRank: summary.rank, promoted: false, newDecorations: [], meritGained: 0 };
  }

  const before = summarizeCombatService(current);
  const stats = { ...current.stats };
  const outcome = event?.outcome;
  const completed = ['win', 'draw', 'loss'].includes(outcome);

  if (outcome === 'retired') {
    stats.retirements += 1;
    stats.currentWinStreak = 0;
  } else if (completed) {
    stats.battles += 1;
    if (outcome === 'win') {
      stats.wins += 1;
      stats.currentWinStreak += 1;
      stats.bestWinStreak = Math.max(stats.bestWinStreak, stats.currentWinStreak);
    } else {
      if (outcome === 'draw') stats.draws += 1;
      else stats.losses += 1;
      stats.currentWinStreak = 0;
    }

    if (Number.isFinite(Number(event?.survivorCount))) {
      const survivors = Math.max(0, Math.min(16, Math.floor(Number(event.survivorCount))));
      stats.totalSurvivors += survivors;
      stats.survivorSamples += 1;
      if (outcome === 'win' && survivors === 16) stats.flawlessWins += 1;
      if (outcome === 'win' && survivors <= 6) stats.hardshipWins += 1;
    }

    if (Number.isFinite(Number(event?.veteranPieces))) {
      stats.maxVeteranPieces = Math.max(stats.maxVeteranPieces, Math.max(0, Math.floor(Number(event.veteranPieces))));
    }
    if (Number.isFinite(Number(event?.elitePieces))) {
      stats.maxElitePieces = Math.max(stats.maxElitePieces, Math.max(0, Math.floor(Number(event.elitePieces))));
    }

    if (event?.variant === 'roguelike' && outcome === 'win') {
      stats.roguelikeFloorsCleared += 1;
      const floor = Math.max(0, Math.floor(finiteNonNegative(event?.roguelikeFloor, 0)));
      stats.highestFloorCleared = Math.max(stats.highestFloorCleared, floor);
      if (floor > 10) stats.endlessFloorsCleared += 1;
    }
    if (outcome === 'win' && event?.bossDefeated) stats.bossesDefeated += 1;
    if (outcome === 'win' && event?.bossDefeated && Number(event?.roguelikeFloor) === 10 && event?.roguelikeMode !== 'endless') {
      stats.towerCompletions += 1;
    }
  }

  let next = {
    ...current,
    stats: normalizeStats(stats),
    processedBattleIds: battleId
      ? [...current.processedBattleIds.filter((id) => id !== battleId), battleId].slice(-MAX_PROCESSED_IDS)
      : current.processedBattleIds,
    migratedLegacyHistory: true,
  };

  const beforeDecorationIds = new Set(next.decorations.map((d) => d.id));
  next = addEligibleDecorations(next, new Date().toISOString());
  const newDecorationIds = next.decorations.filter((d) => !beforeDecorationIds.has(d.id)).map((d) => d.id);
  setProfileStorageItem(KEY, JSON.stringify(next));

  const after = summarizeCombatService(next);
  return {
    record: next,
    previousRank: before.rank,
    currentRank: after.rank,
    promoted: COMBAT_RANKS.findIndex((r) => r.id === after.rank.id) > COMBAT_RANKS.findIndex((r) => r.id === before.rank.id),
    newDecorations: after.decorations.filter((d) => newDecorationIds.includes(d.id)),
    meritGained: Math.max(0, after.merit - before.merit),
  };
}

export function resetCombatService() {
  removeProfileStorageItem(KEY);
  return emptyRecord();
}
