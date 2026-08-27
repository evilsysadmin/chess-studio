import { Chess } from 'chess.js';
import { hitChance, resolveCombatMove } from './combat.js';
import { pieceRankAtLeast } from './combatRanks.js';

// Técnicas tácticas de Combate: desbloqueos persistentes por identidad,
// equipados ANTES de la batalla y consumidos como máximo una vez por batalla.
// No son reglas del ajedrez normal ni afectan Torneo/Puzzles/Partida rápida.
const COMBAT_TECHNIQUES = {
  line_fire: {
    id: 'line_fire',
    label: 'Fuego de línea',
    short: 'LÍNEA',
    description: 'Una vez por batalla, captura como una torre hasta 3 casillas en línea recta. El ataque conserva el % de acierto de Combate.',
    minRank: 'colonel',
    unlockCost: 18,
    originTypes: ['p'],
    maxRange: 3,
  },
};

function originalTypeForKey(key) {
  return String(key || '').split('-')[0];
}

function originalTypeForPiece(piece) {
  const parts = String(piece?.id || '').split('-');
  return parts[1] || piece?.type || null;
}

function levelFromSaved(piece) {
  return 1 + Math.max(0, Number(piece?.strengthPoints) || 0) + Math.max(0, Number(piece?.speedPoints) || 0);
}

export function normalizeTechniqueState(saved = {}) {
  const unlockedTechniques = Array.isArray(saved.unlockedTechniques)
    ? [...new Set(saved.unlockedTechniques.filter((id) => COMBAT_TECHNIQUES[id]))]
    : [];
  const equippedTechnique = unlockedTechniques.includes(saved.equippedTechnique)
    ? saved.equippedTechnique
    : null;
  return { ...saved, unlockedTechniques, equippedTechnique };
}

export function techniqueById(id) {
  return COMBAT_TECHNIQUES[id] || null;
}

export function techniquesEligibleToUnlock(key, saved) {
  if (!saved || saved.alive === false) return [];
  const normalized = normalizeTechniqueState(saved);
  const originalType = originalTypeForKey(key);
  const level = levelFromSaved(normalized);
  return Object.values(COMBAT_TECHNIQUES).filter((technique) => (
    technique.originTypes.includes(originalType)
    && pieceRankAtLeast(level, technique.minRank)
    && !normalized.unlockedTechniques.includes(technique.id)
  ));
}

export function unlockedTechniquesFor(key, saved) {
  if (!saved || saved.alive === false) return [];
  const originalType = originalTypeForKey(key);
  const normalized = normalizeTechniqueState(saved);
  return normalized.unlockedTechniques
    .map(techniqueById)
    .filter((technique) => technique && technique.originTypes.includes(originalType));
}

export function unlockRosterTechnique(rosterState, key, techniqueId) {
  const technique = techniqueById(techniqueId);
  const saved = rosterState?.pieces?.[key];
  if (!technique || !saved || saved.alive === false) return rosterState;
  const normalized = normalizeTechniqueState(saved);
  if (!techniquesEligibleToUnlock(key, normalized).some((candidate) => candidate.id === techniqueId)) return rosterState;
  if ((normalized.bankedXp || 0) < technique.unlockCost) return rosterState;

  const updated = {
    ...normalized,
    bankedXp: normalized.bankedXp - technique.unlockCost,
    unlockedTechniques: [...normalized.unlockedTechniques, techniqueId],
    equippedTechnique: normalized.equippedTechnique || techniqueId,
  };
  return { ...rosterState, pieces: { ...rosterState.pieces, [key]: updated } };
}

export function setRosterEquippedTechnique(rosterState, key, techniqueId) {
  const saved = rosterState?.pieces?.[key];
  if (!saved || saved.alive === false) return rosterState;
  const normalized = normalizeTechniqueState(saved);
  if (techniqueId != null && !unlockedTechniquesFor(key, normalized).some((technique) => technique.id === techniqueId)) return rosterState;
  if (normalized.equippedTechnique === (techniqueId || null)) return rosterState;
  return {
    ...rosterState,
    pieces: {
      ...rosterState.pieces,
      [key]: { ...normalized, equippedTechnique: techniqueId || null },
    },
  };
}

function squareDistance(from, to) {
  const df = Math.abs(from.charCodeAt(0) - to.charCodeAt(0));
  const dr = Math.abs(Number(from[1]) - Number(to[1]));
  if (df !== 0 && dr !== 0) return Infinity;
  return Math.max(df, dr);
}

function rookVirtualFen(fen, from, color) {
  let chess;
  try { chess = new Chess(fen); } catch { return null; }
  const actual = chess.get(from);
  if (!actual || actual.color !== color) return null;
  chess.remove(from);
  if (!chess.put({ type: 'r', color }, from)) return null;
  return chess.fen();
}

function restoreAttackerTypeInFen(fen, square, attacker) {
  let chess;
  try { chess = new Chess(fen); } catch { return null; }
  const current = chess.get(square);
  if (!current || current.color !== attacker.color) return fen;
  chess.remove(square);
  chess.put({ type: attacker.type, color: attacker.color }, square);
  return chess.fen();
}

export function techniqueTargetsFor(fen, registry, from) {
  const attacker = registry?.[from];
  const technique = techniqueById(attacker?.equippedTechnique);
  if (!attacker || !technique || attacker.techniqueUsed || !Array.isArray(attacker.unlockedTechniques) || !attacker.unlockedTechniques.includes(technique.id) || !technique.originTypes.includes(originalTypeForPiece(attacker))) return [];

  let chess;
  try { chess = new Chess(fen); } catch { return []; }
  if (chess.turn() !== attacker.color || chess.inCheck()) return [];

  if (technique.id !== 'line_fire') return [];
  const virtualFen = rookVirtualFen(fen, from, attacker.color);
  if (!virtualFen) return [];
  let virtual;
  try { virtual = new Chess(virtualFen); } catch { return []; }

  return virtual.moves({ square: from, verbose: true })
    .filter((move) => move.captured && squareDistance(from, move.to) <= technique.maxRange)
    .filter((move) => registry?.[move.to] && registry[move.to].color !== attacker.color && registry[move.to].type !== 'k')
    .map((move) => move.to);
}

export function techniqueAttackChance({ registry, from, to, focusStreak = 0 }) {
  const attacker = registry?.[from];
  const defender = registry?.[to];
  if (!attacker || !defender) return null;
  return hitChance(attacker, defender, focusStreak);
}

export function resolveTechniqueAttack({ fen, registry, from, to, focusStreak = 0, randomFn = Math.random }) {
  const attacker = registry?.[from];
  const technique = techniqueById(attacker?.equippedTechnique);
  if (!attacker || !technique || attacker.techniqueUsed) return null;
  if (!techniqueTargetsFor(fen, registry, from).includes(to)) return null;

  const virtualFen = rookVirtualFen(fen, from, attacker.color);
  if (!virtualFen) return null;
  const armedRegistry = {
    ...registry,
    [from]: { ...attacker, techniqueUsed: true },
  };

  // La torre virtual existe sólo para que chess.js valide trayectoria, jaque
  // propio y captura. No permitimos que un "mate" de esa torre temporal fuerce
  // artificialmente el dado al 100 %; tras la captura la pieza vuelve a su
  // clase desplegada real.
  const result = resolveCombatMove({
    fen: virtualFen,
    registry: armedRegistry,
    from,
    to,
    focusStreak,
    randomFn,
    forceMatingCaptures: false,
    protectMissTurnLegality: false,
  });
  if (!result || !result.isCapture) return null;

  let resolved = result;
  let occupiedSquare = resolved.hit === false ? from : to;
  let restoredFen = restoreAttackerTypeInFen(resolved.fen, occupiedSquare, attacker);
  if (!restoredFen) return null;

  // Igual que el motor normal, no permitimos que un fallo cree por turno nulo
  // un mate/ahogado fantasma. La comprobación se hace DESPUÉS de restaurar la
  // clase real, no con la torre virtual usada para validar la trayectoria.
  if (resolved.hit === false) {
    let afterMiss;
    try { afterMiss = new Chess(restoredFen); } catch { return null; }
    if (afterMiss.moves().length === 0) {
      resolved = resolveCombatMove({
        fen: virtualFen,
        registry: armedRegistry,
        from,
        to,
        focusStreak,
        randomFn: () => 0,
        forceMatingCaptures: false,
        protectMissTurnLegality: false,
      });
      if (!resolved) return null;
      occupiedSquare = to;
      restoredFen = restoreAttackerTypeInFen(resolved.fen, occupiedSquare, attacker);
      if (!restoredFen) return null;
    }
  }

  return {
    ...resolved,
    fen: restoredFen,
    techniqueId: technique.id,
    techniqueLabel: technique.label,
    applied: {
      ...resolved.applied,
      piece: attacker.type,
      san: `† ${technique.short} ${from}×${to}`,
    },
  };
}
