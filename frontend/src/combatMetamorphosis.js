import { setProfileStorageItem } from './profileKeys.js';
import { pieceRankAtLeast } from './combatRanks.js';
import { unitRecordForKey } from './combatUnitService.js';

// Metamorfosis = LOADOUT de batalla, no evolución irreversible. La identidad
// y la clase de origen nunca cambian. Se elige en la pantalla prebatalla y
// queda congelada durante esa batalla.
const ROSTER_KEY = 'chess-study-combat-roster';
export const METAMORPHOSIS_LABELS = { p: 'Peón', n: 'Caballo', b: 'Alfil', r: 'Torre', q: 'Dama' };

// El rango abre la puerta, pero el servicio real decide si el veterano se ha
// ganado esa forma. Esto evita que una pieza farmeada únicamente con XP se
// convierta en una unidad mutante sin haber sobrevivido ni hecho nada digno.
const FORM_REQUIREMENTS = Object.freeze({
  n: {
    rankId: 'commander',
    rankLabel: 'Comandante',
    requirementLabel: '3 supervivencias',
    serviceTest: (stats) => (stats?.survivals || 0) >= 3,
    progressLabel: (stats) => `${Math.min(3, stats?.survivals || 0)}/3 supervivencias`,
  },
  b: {
    rankId: 'colonel',
    rankLabel: 'Coronel',
    requirementLabel: 'medallas Cinco bajas + Hierro viejo',
    serviceTest: (stats) => (stats?.kills || 0) >= 5 && (stats?.bestSurvivalStreak || 0) >= 5,
    progressLabel: (stats) => `${Math.min(5, stats?.kills || 0)}/5 bajas · ${Math.min(5, stats?.bestSurvivalStreak || 0)}/5 racha superviviente`,
  },
  r: {
    rankId: 'general',
    rankLabel: 'General',
    requirementLabel: 'Veterano de campaña + Cicatriz del Rey Viejo',
    serviceTest: (stats) => (stats?.battles || 0) >= 10 && (stats?.survivals || 0) >= 7 && (stats?.bossVictories || 0) >= 1,
    progressLabel: (stats) => `${Math.min(10, stats?.battles || 0)}/10 batallas · ${Math.min(7, stats?.survivals || 0)}/7 supervivencias · ${Math.min(1, stats?.bossVictories || 0)}/1 boss`,
  },
});

function levelFromSaved(piece) {
  return 1 + Math.max(0, Number(piece?.strengthPoints) || 0) + Math.max(0, Number(piece?.speedPoints) || 0);
}

function originRosterKey(piece) {
  const parts = String(piece?.id || '').split('-');
  const type = parts[1];
  const startSquare = parts[2];
  if (!type || !startSquare) return null;
  return `${type}-${startSquare[0]}`;
}

export function deploymentUnlockStatus(key, saved, unitRecord = null) {
  const original = String(key || '').split('-')[0];
  const level = levelFromSaved(saved);
  const statuses = [{
    type: original,
    label: METAMORPHOSIS_LABELS[original] || original,
    unlocked: true,
    rankMet: true,
    serviceMet: true,
    requirementLabel: 'Clase de origen',
    progressLabel: 'Disponible',
  }];

  if (!saved || saved.alive === false || original !== 'p') return statuses;
  const stats = unitRecord?.stats || {};
  for (const type of ['n', 'b', 'r']) {
    const requirement = FORM_REQUIREMENTS[type];
    const rankMet = pieceRankAtLeast(level, requirement.rankId);
    const serviceMet = requirement.serviceTest(stats);
    statuses.push({
      type,
      label: METAMORPHOSIS_LABELS[type],
      unlocked: rankMet && serviceMet,
      rankMet,
      serviceMet,
      rankId: requirement.rankId,
      rankLabel: requirement.rankLabel,
      requirementLabel: requirement.requirementLabel,
      progressLabel: requirement.progressLabel(stats),
    });
  }
  return statuses;
}

export function unlockedDeploymentTypes(key, saved, unitRecord = null) {
  return deploymentUnlockStatus(key, saved, unitRecord).filter((status) => status.unlocked).map((status) => status.type);
}

export function canChooseDeploymentType(key, saved, targetType, unitRecord = null) {
  return unlockedDeploymentTypes(key, saved, unitRecord).includes(targetType);
}

export function setRosterDeploymentType(rosterState, key, targetType) {
  const saved = rosterState?.pieces?.[key];
  const original = String(key || '').split('-')[0];
  const unitRecord = unitRecordForKey(rosterState, key);
  if (!saved || !canChooseDeploymentType(key, saved, targetType, unitRecord)) return rosterState;
  const deploymentType = targetType === original ? null : targetType;
  return {
    ...rosterState,
    pieces: { ...rosterState.pieces, [key]: { ...saved, deploymentType, metamorphosis: undefined } },
  };
}

export function persistMetamorphosedRoster(state) {
  setProfileStorageItem(ROSTER_KEY, JSON.stringify(state));
  return state;
}

export function applyRosterMetamorphosesToPosition(chess, registry, rosterState, humanColor) {
  const next = { ...registry };
  for (const [square, piece] of Object.entries(registry || {})) {
    if (!piece || piece.color !== humanColor) continue;
    const key = originRosterKey(piece);
    const saved = key ? rosterState?.pieces?.[key] : null;
    const targetType = saved?.deploymentType;
    const unitRecord = key ? unitRecordForKey(rosterState, key) : null;
    if (!targetType || !canChooseDeploymentType(key, saved, targetType, unitRecord)) continue;

    const boardPiece = chess.get(square);
    if (!boardPiece || boardPiece.color !== humanColor) continue;
    chess.remove(square);
    const placed = chess.put({ type: targetType, color: humanColor }, square);
    if (!placed) {
      chess.put(boardPiece, square);
      continue;
    }
    next[square] = { ...piece, type: targetType, deploymentType: targetType };
  }
  return next;
}
