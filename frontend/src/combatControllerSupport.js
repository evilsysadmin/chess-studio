import { Chess } from 'chess.js';
import { BASE_STATS, capturedSquareFor, derivedLevel, hitChance, isForcedCombatCapture, passTurnFen } from './combat.js';
import { chooseCombatCandidate, combatCandidateUtility, hasMeasuredChessScoreCp } from './combatExpectedUtility.js';
import { combatDoctrineBonusForMove } from './combatEnemyDoctrine.js';
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
const EMERGENCY_CPU_MISS_TEMPO_SCORE = 90;

// El fallback no dispone de búsqueda profunda. Comprueba únicamente si la
// pieza recién movida puede ser capturada LEGALMENTE en la réplica inmediata.
// Una captura Combat puede fallar: el tablero de chess.js después de capturar
// sólo existe en la rama de éxito, ponderada por su probabilidad real.
// El máximo riesgo mide exposición táctica, no predice qué elegirá el rival.
// Sin registro coherente, no se fabrican porcentajes ni amenazas.
function emergencyRecapturePenalty(after, move, registry, focus, branchChance = 1, threatenedSquare = move.to) {
  // Una promoción sólo cambia el tipo si la captura acierta. Tras un fallo,
  // el peón sigue en su casilla inicial y puede ser atacado normalmente.
  if (!registry || (move.promotion && threatenedSquare !== move.from)
    || /[kq]/.test(move.flags || '') || move.piece === 'k') return 0;
  const original = registry[move.from];
  if (!original || original.color !== move.color || original.type !== move.piece
    || !pieceSquareMatches(original, move.from)) return 0;
  const moved = { ...original, square: threatenedSquare };
  let maxChance = 0;
  for (const reply of after.moves({ verbose: true })) {
    if (!reply.captured || reply.captured !== move.piece || capturedSquareFor(reply) !== threatenedSquare) continue;
    const enemy = registry[reply.from];
    if (!enemy || enemy.color === move.color || enemy.type !== reply.piece
      || !pieceSquareMatches(enemy, reply.from)) return 0;
    const forced = isForcedCombatCapture(after.fen(), reply.from, reply.to, reply.promotion);
    const chance = forced ? 1 : hitChance(enemy, moved, focusStreakFor(focus, enemy.color, original.id));
    maxChance = Math.max(maxChance, chance);
  }
  const pieceValue = EMERGENCY_CPU_PIECE_VALUE[move.piece] || 0;
  const chance = Math.max(0, Math.min(1, Number(branchChance) || 0));
  return maxChance * chance * (100 + pieceValue * 10);
}

// La segunda rama de una captura Combat NO contiene el movimiento intentado:
// un fallo es un turno nulo, no una captura de chess.js. Sólo inspeccionamos
// recapturas legales del atacante en su casilla ORIGINAL; nunca damos por
// muerto al defensor ni mantenemos un derecho al paso ya consumido.
// Si el fallo crearía un turno enemigo sin jugadas legales, Combat fuerza
// el acierto: esa rama no existe y no debe recibir una penalización ficticia.
export function emergencyCombatMissExposurePenalty(fen, move, registry, focus = {}, missChance = 0) {
  if (!move?.captured || !registry || !Number.isFinite(missChance) || missChance <= 0) return 0;
  try {
    const afterMiss = new Chess(passTurnFen(fen));
    if (afterMiss.moves().length === 0) return 0;
    return emergencyRecapturePenalty(afterMiss, move, registry, focus, missChance, move.from);
  } catch {
    return 0;
  }
}

// Fallback estrictamente local para que una caída del endpoint de análisis no
// secuestre una campaña. Sólo elige entre jugadas legales de chess.js y nunca
// altera dificultad, XP ni reglas de Combat. Prioriza mate, capturas, promoción
// y jaques; los empates se resuelven de forma determinista para facilitar tests
// y recuperación de sesión.
export function emergencyCombatCpuSuggestion(fen, registry = null, focus = {}, doctrine = null) {
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
      let captureSuccessChance = 1;
      let measuredCapture = !move.captured;
      if (move.captured) {
        const chessCaptureScore = 100 + (EMERGENCY_CPU_PIECE_VALUE[move.captured] || 0) * 10
          - (EMERGENCY_CPU_PIECE_VALUE[move.piece] || 0);
        const facts = registry ? measuredCombatCapture(fen, registry, move, focus) : null;
        // Con hechos completos, una captura que puede fallar no vale lo
        // mismo que una captura garantizada. Un fallo también consume turno.
        // Si el registro está incompleto mantenemos el fallback histórico.
        captureSuccessChance = facts?.hitChance ?? 0;
        measuredCapture = Boolean(facts);
        score += facts
          ? facts.hitChance * chessCaptureScore - (1 - facts.hitChance) * EMERGENCY_CPU_MISS_TEMPO_SCORE
          : chessCaptureScore;
      }
      // Sin engine, una dama expuesta a una recaptura legal no es un premio
      // gratis. Para capturas, sólo valoramos la rama cuyo éxito es medible.
      if (measuredCapture) {
        score -= emergencyRecapturePenalty(probe, move, registry, focus, captureSuccessChance);
        if (move.captured && captureSuccessChance < 1) {
          score -= emergencyCombatMissExposurePenalty(fen, move, registry, focus, 1 - captureSuccessChance);
        }
      }
      if (move.promotion) score += 70 + (EMERGENCY_CPU_PIECE_VALUE[move.promotion] || 0) * 4;
      if (probe.isCheck()) score += 18;
      if (move.flags?.includes('k') || move.flags?.includes('q')) score += 2;
      // Misma doctrina factual que la shortlist remota, acotada a ±6.
      // No altera mates, grandes diferencias materiales ni la ruta clásica.
      score += combatDoctrineBonusForMove(doctrine, move);
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

// Una única fuente de hechos para la shortlist remota y la CPU local:
// verifica captura, defensor real (incluido al paso), posibilidad de golpe
// forzado y foco actual. Nunca inventa porcentajes si falta el registro.
// Los snapshots antiguos pueden omitir square; si la incluyen, debe coincidir
// con el FEN. Nunca atribuir XP/veteranía a una identidad desplazada.
function pieceSquareMatches(piece, square) {
  return piece?.square == null || piece.square === square;
}

function measuredCombatCapture(fen, registry, move, focus) {
  if (!move.captured) return null;
  const attacker = registry?.[move.from];
  if (!attacker || attacker.color !== move.color || attacker.type !== move.piece
    || !pieceSquareMatches(attacker, move.from)) return null;
  const defenderSquare = capturedSquareFor(move);
  const defender = registry?.[defenderSquare];
  if (!defender || defender.color === attacker.color || defender.type !== move.captured
    || !pieceSquareMatches(defender, defenderSquare)) return null;
  const forcedHit = isForcedCombatCapture(fen, move.from, move.to, move.promotion);
  return {
    hitChance: forcedHit ? 1 : hitChance(attacker, defender, focusStreakFor(focus, attacker.color, defender.id)),
    enemyValue: BASE_STATS[defender.type]?.strength || 0,
    enemyPersistentValue: defender.identityId ? Math.max(0, derivedLevel(defender) - 1) : 0,
  };
}

// Adjunta sólo hechos que Combat conoce de verdad en el momento de elegir:
// probabilidad de que una captura conecte y veteranía persistente del objetivo.
// Si FEN/registro no permiten demostrar esos datos, la candidata permanece
// sin marcar y jamás puede desplazar la jugada principal del motor.
export function annotateCombatCandidates(fen, registry, remote, focus = {}, doctrine = null) {
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
    if (!attacker || attacker.color !== move.color || attacker.type !== move.piece
      || !pieceSquareMatches(attacker, move.from)) return candidate;

    // Comprobar el mate contra el FEN, nunca confiar en una marca de la API.
    let verifiedCandidate = candidate;
    if (candidate.isMate === true) {
      try {
        const after = new Chess(fen);
        after.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
        verifiedCandidate = { ...candidate, isMate: after.isCheckmate() };
      } catch {
        return candidate;
      }
    }
    const doctrineBonusCp = combatDoctrineBonusForMove(doctrine, move);

    if (!move.captured) {
      return { ...verifiedCandidate, combatReady: true, hitChance: 1, enemyValue: 0, enemyPersistentValue: 0, doctrineBonusCp };
    }

    const facts = measuredCombatCapture(fen, registry, move, focus);
    return facts ? { ...verifiedCandidate, combatReady: true, ...facts, doctrineBonusCp } : candidate;
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
  // La shortlist no puede promover un supuesto 0 cp cuando la puntuación
  // es null/vacía: conservar la jugada profunda si falta cualquier prueba.
  if (!hasMeasuredChessScoreCp(primary) || !hasMeasuredChessScoreCp(chosen)) return remote;

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
export async function resolveCombatCpuTurnSuggestion({ fen, difficulty, analyzePosition, registry = null, focus = {}, doctrine = null }) {
  let remoteError = null;
  try {
    const response = await analyzePosition(fen, difficulty);
    const measured = annotateCombatCandidates(fen, registry, response, focus, doctrine);
    const remote = selectCombatAwareRemoteSuggestion(measured);
    if (!isLegalCombatCpuSuggestion(fen, remote)) throw new Error('La CPU devolvió una jugada inválida.');
    return { suggestion: remote, source: 'remote', remoteError: null };
  } catch (error) {
    remoteError = error;
  }

  const local = emergencyCombatCpuSuggestion(fen, registry, focus, doctrine);
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

export function buildCombatSessionSnapshot({
  fen,
  registry,
  humanColor,
  combatLog,
  uiLog,
  autoLevelUpEnabled,
  focus,
  positionCounts,
  bossHp,
  bossPhase,
  battleStartRoster,
  battleParticipants,
  unitBattleStats,
  activityGameId,
}) {
  return {
    phase: 'battle',
    fen,
    registry,
    humanColor,
    combatLog,
    uiLog: Array.isArray(uiLog) ? uiLog.slice(0, 8) : [],
    autoLevelUpEnabled: autoLevelUpEnabled !== false,
    focus,
    positionCounts: Array.from(positionCounts || []),
    bossHp,
    bossPhase,
    battleStartRoster,
    battleParticipants,
    unitBattleStats,
    activityGameId,
  };
}
