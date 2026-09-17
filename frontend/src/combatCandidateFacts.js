import { Chess } from 'chess.js';
import {
  BASE_STATS,
  combatPositionIssues,
  capturedSquareFor,
  derivedLevel,
  hitChance,
  isForcedCombatCapture,
} from './combat.js';

export const COMBAT_PRIMARY_ANCHOR_MAX_DISAGREEMENT_CP = 80;

function normalizedPromotion(value) {
  const promotion = value == null ? null : String(value).toLowerCase();
  return ['q', 'r', 'b', 'n'].includes(promotion) ? promotion : null;
}

function sameMove(a, b) {
  if (!a?.from || !a?.to || !b?.from || !b?.to) return false;
  if (a.from !== b.from || a.to !== b.to) return false;
  const aPromotion = normalizedPromotion(a.promotion);
  const bPromotion = normalizedPromotion(b.promotion);
  if (aPromotion === bPromotion) return true;
  // La API histórica permite omitir promoción y Combat corona a dama.
  return (aPromotion == null && bPromotion === 'q') || (bPromotion == null && aPromotion === 'q');
}

function verboseMoveFor(chess, candidate) {
  if (!candidate?.from || !candidate?.to) return null;
  const requestedPromotion = normalizedPromotion(candidate.promotion);
  return chess.moves({ square: candidate.from, verbose: true }).find((move) => {
    if (move.to !== candidate.to) return false;
    if (!move.promotion) return requestedPromotion == null;
    return (requestedPromotion || 'q') === move.promotion;
  }) || null;
}

function focusStreakFor(focus, attacker, defender) {
  if (!attacker || !defender) return 0;
  const tracker = focus?.[attacker.color];
  if (!tracker || tracker.targetId !== defender.id) return 0;
  return Math.max(0, Number(tracker.streak) || 0);
}

function persistentValue(piece) {
  if (!piece?.identityId || piece.type === 'k') return 0;
  return Math.max(0, derivedLevel(piece) - 1);
}

function localMateAfter(fen, move) {
  try {
    const probe = new Chess(fen);
    probe.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
    return probe.isCheckmate();
  } catch {
    return false;
  }
}

// Convierte la shortlist ajedrecística en hechos de Combat sin inventar señales.
// Si FEN/registro discrepan, falta la jugada primaria profunda, una candidata es
// dudosa o el pase corto contradice demasiado a la primaria, devuelve EXACTAMENTE
// la respuesta original y el selector mantiene el comportamiento histórico.
export function enrichCombatRemoteSuggestion({ fen, registry, focus = null, remote }) {
  const candidates = Array.isArray(remote?.candidates) ? remote.candidates : null;
  if (!fen || !registry || !candidates?.length || candidates.length > 5) return remote;
  if (combatPositionIssues(fen, registry).length) return remote;

  let chess;
  try {
    chess = new Chess(fen);
  } catch {
    return remote;
  }

  const primary = candidates.find((candidate) => sameMove(candidate, remote));
  if (!primary || !Number.isFinite(Number(primary.chessScoreCp))) return remote;
  if (candidates.some((candidate) => candidate?.isLegal === false || !Number.isFinite(Number(candidate?.chessScoreCp)))) return remote;

  const bestShallowScore = Math.max(...candidates.map((candidate) => Number(candidate.chessScoreCp)));
  if (bestShallowScore - Number(primary.chessScoreCp) > COMBAT_PRIMARY_ANCHOR_MAX_DISAGREEMENT_CP) return remote;

  const enriched = [];
  for (const candidate of candidates) {
    const move = verboseMoveFor(chess, candidate);
    if (!move) return remote;

    const attacker = registry[move.from];
    if (!attacker || attacker.color !== chess.turn() || attacker.type !== move.piece) return remote;

    let defender = null;
    if (move.captured) {
      defender = registry[capturedSquareFor(move)];
      if (!defender || defender.color === attacker.color || defender.type !== move.captured) return remote;
    }

    const isMate = localMateAfter(fen, move);
    const forcedHit = !!defender && isForcedCombatCapture(fen, move.from, move.to, move.promotion || candidate.promotion);
    const streak = focusStreakFor(focus, attacker, defender);
    const chance = defender ? (forcedHit ? 1 : hitChance(attacker, defender, streak)) : 1;

    enriched.push({
      ...candidate,
      from: move.from,
      to: move.to,
      ...(move.promotion ? { promotion: move.promotion } : {}),
      moveKey: `${move.from}${move.to}${move.promotion || ''}`,
      isLegal: true,
      isMate,
      combatReady: true,
      hitChance: chance,
      enemyValue: defender ? (BASE_STATS[defender.type]?.strength || 0) : 0,
      enemyPersistentValue: persistentValue(defender),
      ownPersistentValue: persistentValue(attacker),
      ownCasualtyRisk: 0,
      exposureRisk: 0,
      expectedBossDamage: 0,
      techniqueValue: 0,
    });
  }

  const enrichedPrimary = enriched.find((candidate) => sameMove(candidate, remote));
  if (!enrichedPrimary) return remote;
  // Mate profundo: no hay nada que re-rankear. Y si el pase corto afirma que
  // otra jugada da mate mientras la primaria no, hay una discrepancia demasiado
  // fuerte para que Combat cambie de plan sobre ese análisis superficial.
  if (enrichedPrimary.isMate || enriched.some((candidate) => candidate.isMate && !sameMove(candidate, remote))) return remote;

  return { ...remote, candidates: enriched };
}
