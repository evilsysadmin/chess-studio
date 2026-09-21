import { Chess } from 'chess.js';
import { BASE_STATS, capturedSquareFor, derivedLevel, hitChance, isForcedCombatCapture } from './combat.js';
import { chooseCombatCandidate, combatCandidateUtility } from './combatExpectedUtility.js';
import { proceduralNarrative } from './narrativeProvider.js';

export const STATUS_LABELS = Object.freeze({
  playing: '',
  check: 'Jaque',
  checkmate: 'Jaque mate',
  stalemate: 'Tablas por ahogado',
  draw: 'Tablas',
  repetition: 'Tablas por repetición',
});

// Pequeña pausa deliberada para que la CPU no parezca telepática.
export const CPU_DELAY_MS = 500;

export function resolveHumanColor(choice, random = Math.random) {
  if (choice === 'w' || choice === 'b') return choice;
  return random() < 0.5 ? 'w' : 'b';
}

export function emptyUnitBattleStats() {
  return { killsByIdentity: {}, bossDamageByIdentity: {}, bossFinisherIdentityId: null, underdogCredits: 0, tacticalCredits: 0 };
}

export function incrementIdentityCounter(bucket, identityId, amount = 1) {
  if (!identityId || !Number.isFinite(Number(amount)) || Number(amount) <= 0) return bucket;
  return { ...bucket, [identityId]: (bucket[identityId] || 0) + Number(amount) };
}


export function isLegalCombatCpuSuggestion(fen, suggestion) {
  if (!fen || !suggestion?.from || !suggestion?.to) return false;
  try {
    const chess = new Chess(fen);
    const promotion = suggestion.promotion == null ? null : String(suggestion.promotion).toLowerCase();
    if (promotion != null && !['q', 'r', 'b', 'n'].includes(promotion)) return false;
    return chess.moves({ square: suggestion.from, verbose: true }).some((move) => {
      if (move.to !== suggestion.to) return false;
      if (!move.promotion) return promotion == null;
      // La API histórica puede omitir promoción: el motor de Combat conserva
      // entonces la coronación a dama. Si viene explícita, debe coincidir.
      return (promotion || 'q') === move.promotion;
    });
  } catch {
    return false;
  }
}


const EMERGENCY_CPU_PIECE_VALUE = Object.freeze({ p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 });

// Fallback estrictamente local para que una caída del endpoint de análisis no
// secuestre una campaña. Sólo elige entre jugadas legales de chess.js y nunca
// altera dificultad, XP ni reglas de Combat. Prioriza mate, capturas, promoción
// y jaques; los empates se resuelven de forma determinista para facilitar tests
// y recuperación de sesión.
export function emergencyCombatCpuSuggestion(fen) {
  try {
    const chess = new Chess(fen);
    const moves = chess.moves({ verbose: true });
    if (!moves.length) return null;
    const ranked = moves.map((move) => {
      const probe = new Chess(fen);
      let applied = null;
      try { applied = probe.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' }); } catch { applied = null; }
      if (!applied) return null;
      let score = 0;
      if (probe.isCheckmate()) score += 10000;
      if (move.captured) score += 100 + (EMERGENCY_CPU_PIECE_VALUE[move.captured] || 0) * 10 - (EMERGENCY_CPU_PIECE_VALUE[move.piece] || 0);
      if (move.promotion) score += 70 + (EMERGENCY_CPU_PIECE_VALUE[move.promotion] || 0) * 4;
      if (probe.isCheck()) score += 18;
      if (move.flags?.includes('k') || move.flags?.includes('q')) score += 2;
      return { from: move.from, to: move.to, promotion: move.promotion || undefined, score, key: `${move.from}${move.to}${move.promotion || ''}` };
    }).filter(Boolean);
    ranked.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
    const best = ranked[0];
    return best ? { from: best.from, to: best.to, ...(best.promotion ? { promotion: best.promotion } : {}) } : null;
  } catch {
    return null;
  }
}

function sameCombatMove(left, right) {
  if (!left || !right) return false;
  return left.from === right.from
    && left.to === right.to
    && String(left.promotion || 'q') === String(right.promotion || 'q');
}

function focusStreakFor(focus, attackerColor, defenderId) {
  const current = focus?.[attackerColor];
  if (!current || current.targetId !== defenderId) return 0;
  return Math.max(0, Number(current.streak) || 0);
}

// Adjunta sólo hechos que Combat conoce de verdad en el momento de elegir:
// probabilidad de que una captura conecte y veteranía persistente del objetivo.
// Si FEN/registro no permiten demostrar esos datos, la candidata permanece
// sin marcar y jamás puede desplazar la jugada principal del motor.
export function annotateCombatCandidates(fen, registry, remote, focus = {}) {
  const candidates = Array.isArray(remote?.candidates) ? remote.candidates : null;
  if (!candidates?.length || !registry || typeof registry !== 'object' || Array.isArray(registry)) return remote;

  let chess;
  try {
    chess = new Chess(fen);
  } catch {
    return remote;
  }

  const enriched = candidates.map((candidate) => {
    if (!candidate?.from || !candidate?.to || candidate.isLegal === false) return candidate;
    const promotion = candidate.promotion == null ? null : String(candidate.promotion).toLowerCase();
    const move = chess.moves({ square: candidate.from, verbose: true }).find((legalMove) => {
      if (legalMove.to !== candidate.to) return false;
      if (!legalMove.promotion) return promotion == null;
      return (promotion || 'q') === legalMove.promotion;
    });
    if (!move) return candidate;

    const attacker = registry[move.from];
    if (!attacker || attacker.color !== move.color || attacker.type !== move.piece) return candidate;

    if (!move.captured) {
      return { ...candidate, combatReady: true, hitChance: 1, enemyValue: 0, enemyPersistentValue: 0 };
    }

    const defender = registry[capturedSquareFor(move)];
    if (!defender || defender.color === attacker.color || defender.type !== move.captured) return candidate;

    const forcedHit = isForcedCombatCapture(fen, move.from, move.to, move.promotion);
    const chance = forcedHit
      ? 1
      : hitChance(attacker, defender, focusStreakFor(focus, attacker.color, defender.id));

    return {
      ...candidate,
      combatReady: true,
      hitChance: chance,
      enemyValue: BASE_STATS[defender.type]?.strength || 0,
      enemyPersistentValue: defender.identityId ? Math.max(0, derivedLevel(defender) - 1) : 0,
    };
  });

  return { ...remote, candidates: enriched };
}

// La shortlist de candidatos es deliberadamente más barata que la búsqueda
// principal. Por eso no permitimos que su orden ajedrecístico superficial
// sustituya por sí solo a la jugada profunda. Sólo hay override cuando la
// corrección específica de Combat mejora de verdad la utilidad esperada.
export function selectCombatAwareRemoteSuggestion(remote) {
  const candidates = Array.isArray(remote?.candidates)
    ? remote.candidates.filter((candidate) => candidate?.combatReady === true)
    : null;
  if (!candidates?.length) return remote;

  const primary = candidates.find((candidate) => sameCombatMove(candidate, remote));
  if (!primary) return remote;

  const chosen = chooseCombatCandidate(candidates);
  if (!chosen) return remote;
  if (sameCombatMove(chosen, primary)) return chosen;
  if (primary.isMate === true) return remote;
  if (chosen.isMate === true) return chosen;

  const primaryUtility = combatCandidateUtility(primary);
  const chosenUtility = combatCandidateUtility(chosen);
  if (!Number.isFinite(primaryUtility) || !Number.isFinite(chosenUtility)) return remote;

  const primaryChess = Number(primary.chessScoreCp);
  const chosenChess = Number(chosen.chessScoreCp);
  if (!Number.isFinite(primaryChess) || !Number.isFinite(chosenChess)) return remote;

  const primaryCombatAdjustment = primaryUtility - primaryChess;
  const chosenCombatAdjustment = chosenUtility - chosenChess;
  if (chosenCombatAdjustment <= primaryCombatAdjustment + 1e-9) return remote;
  return chosenUtility > primaryUtility + 1e-9 ? chosen : remote;
}

// Política de disponibilidad del turno CPU: el análisis remoto mejora la
// calidad de la jugada, pero nunca tiene derecho a bloquear una campaña.
// Este helper hace el fail-open comprobable con tests sin montar React.
export async function resolveCombatCpuTurnSuggestion({ fen, difficulty, analyzePosition, registry = null, focus = {} }) {
  let remoteError = null;
  try {
    const response = await analyzePosition(fen, difficulty);
    const measured = annotateCombatCandidates(fen, registry, response, focus);
    const remote = selectCombatAwareRemoteSuggestion(measured);
    if (!isLegalCombatCpuSuggestion(fen, remote)) throw new Error('La CPU devolvió una jugada inválida.');
    return { suggestion: remote, source: 'remote', remoteError: null };
  } catch (error) {
    remoteError = error;
  }

  const local = emergencyCombatCpuSuggestion(fen);
  if (local && isLegalCombatCpuSuggestion(fen, local)) {
    return { suggestion: local, source: 'local', remoteError };
  }
  throw remoteError || new Error('La CPU no pudo completar su turno.');
}

export function buildCombatLogEntry(result, humanColor) {
  if (!result?.isCapture) return null;
  const { attacker, defender, hit, chance, survivalXp } = result;
  if (!attacker || !defender) return null;
  const attackerIsHuman = attacker.color === humanColor;
  const attackerName = `${attacker.alias ? `${attacker.alias}, ` : ''}${BASE_STATS[attacker.type].name}`;
  const defenderName = `${defender.alias ? `${defender.alias}, ` : ''}${BASE_STATS[defender.type].name}`;
  const pct = Math.round(chance * 100);

  if (result.techniqueId) {
    const text = proceduralNarrative({
      type: hit ? 'technique_hit' : 'technique_miss',
      alias: attacker.alias || BASE_STATS[attacker.type].name,
      piece: BASE_STATS[attacker.type].name,
      technique: result.techniqueLabel || result.techniqueId,
      target: defenderName,
    });
    return { text: `${text} · ${pct}% de acierto`, tone: hit ? (attackerIsHuman ? 'good' : 'bad') : 'neutral', kind: hit ? 'technique' : 'miss' };
  }

  if (hit) {
    const subject = attackerIsHuman ? 'Tu' : 'La CPU: su';
    const text = `${subject} ${attackerName} (nv.${derivedLevel(attacker)}) elimina ${defenderName} (nv.${derivedLevel(defender)}) · ${pct}% de acierto`;
    return { text, tone: attackerIsHuman ? 'good' : 'bad', kind: attackerIsHuman ? 'capture' : 'casualty' };
  }

  const attackerLabel = attackerIsHuman ? 'tu' : 'la CPU';
  const text = `${defenderName} (nv.${derivedLevel(defender)}) esquiva el ataque de ${attackerLabel} ${attackerName} · +${survivalXp} XP por sobrevivir`;
  return { text, tone: defender.color === humanColor ? 'good' : 'neutral', kind: 'miss' };
}

// Temporary compatibility export; new code should import from combatBattleState.js.
export { buildCombatSessionSnapshot } from './combatBattleState.js';
