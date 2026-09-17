import { Chess } from 'chess.js';
import { combatPositionIssues, derivedLevel, hitChance, isForcedCombatCapture } from './combat.js';
import { combatSessionContextForFen } from './combatSession.js';

const MATERIAL_VALUE = Object.freeze({ p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 });
export const PRIMARY_CONSISTENCY_CP = 35;

function normalizedPromotion(value) {
  const promotion = value == null ? null : String(value).toLowerCase();
  return ['q', 'r', 'b', 'n'].includes(promotion) ? promotion : null;
}

function candidateMoveKey(candidate) {
  if (!candidate?.from || !candidate?.to) return null;
  return `${candidate.from}${candidate.to}${normalizedPromotion(candidate.promotion) || ''}`;
}

function primaryMoveKey(remote) {
  return candidateMoveKey(remote);
}

function matchingVerboseMove(chess, candidate) {
  const promotion = normalizedPromotion(candidate?.promotion);
  try {
    return chess.moves({ square: candidate?.from, verbose: true }).find((move) => {
      if (move.to !== candidate?.to) return false;
      if (!move.promotion) return promotion == null;
      return (promotion || 'q') === move.promotion;
    }) || null;
  } catch {
    return null;
  }
}

function capturedSquare(move) {
  if (!move) return null;
  return move.flags?.includes('e') ? `${move.to[0]}${move.from[1]}` : move.to;
}

function persistentProgressValue(piece) {
  if (!piece?.identityId || piece.type === 'k') return 0;
  return Math.max(0, derivedLevel(piece) - 1);
}

function candidateCombatFacts(chess, fen, registry, focus, candidate) {
  if (!candidate || candidate.isLegal === false) return null;
  const move = matchingVerboseMove(chess, candidate);
  const attacker = move ? registry?.[move.from] : null;
  if (!move || !attacker || attacker.color !== move.color || attacker.type !== move.piece) return null;

  const isCapture = move.flags?.includes('c') || move.flags?.includes('e');
  const defender = isCapture ? registry?.[capturedSquare(move)] : null;
  if (isCapture && !defender) return null;

  const tracker = defender ? focus?.[attacker.color] : null;
  const focusStreak = tracker?.targetId === defender?.id ? Math.max(0, Number(tracker.streak) || 0) : 0;
  const forcedHit = isCapture && isForcedCombatCapture(fen, move.from, move.to, move.promotion);
  const chance = isCapture ? (forcedHit ? 1 : hitChance(attacker, defender, focusStreak)) : 1;

  return {
    ...candidate,
    hitChance: chance,
    enemyValue: defender ? (MATERIAL_VALUE[defender.type] || 0) : 0,
    enemyPersistentValue: persistentProgressValue(defender),
    ownPersistentValue: persistentProgressValue(attacker),
    // Exposure/casualty risk needs the opponent reply position. Keep it neutral
    // until that factual one-ply layer is added instead of inventing a number.
    ownCasualtyRisk: 0,
    exposureRisk: 0,
  };
}

export function enrichCombatCandidateResponse(remote, { fen, registry = null, focus = null, consistencyCp = PRIMARY_CONSISTENCY_CP } = {}) {
  const candidates = Array.isArray(remote?.candidates) ? remote.candidates : null;
  if (!candidates?.length || !fen) return remote;

  const persisted = registry ? null : combatSessionContextForFen(fen);
  const resolvedRegistry = registry || persisted?.registry || null;
  const resolvedFocus = registry ? focus : (persisted?.focus || null);
  if (!resolvedRegistry || combatPositionIssues(fen, resolvedRegistry).length) return remote;

  let chess;
  try { chess = new Chess(fen); } catch { return remote; }

  const enriched = [];
  for (const candidate of candidates) {
    const facts = candidateCombatFacts(chess, fen, resolvedRegistry, resolvedFocus, candidate);
    if (!facts) return remote;
    enriched.push(facts);
  }

  const primaryKey = primaryMoveKey(remote);
  const primary = enriched.find((candidate) => candidate.moveKey === primaryKey);
  if (!primary || !Number.isFinite(Number(primary.chessScoreCp))) return remote;

  const scores = enriched.map((candidate) => Number(candidate.chessScoreCp));
  if (scores.some((score) => !Number.isFinite(score))) return remote;
  const bestShallowScore = Math.max(...scores);
  if (bestShallowScore - Number(primary.chessScoreCp) > Math.max(0, Number(consistencyCp) || 0)) return remote;

  return {
    ...remote,
    candidates: enriched.map((candidate) => ({ ...candidate, combatReady: true })),
  };
}

export const __test = Object.freeze({ candidateMoveKey, persistentProgressValue });
