import { Chess } from 'chess.js';
import { BASE_STATS, derivedLevel } from './combat.js';
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
    return chess.moves({ square: suggestion.from, verbose: true }).some((move) => move.to === suggestion.to);
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

// Política de disponibilidad del turno CPU: el análisis remoto mejora la
// calidad de la jugada, pero nunca tiene derecho a bloquear una campaña.
// Este helper hace el fail-open comprobable con tests sin montar React.
export async function resolveCombatCpuTurnSuggestion({ fen, difficulty, analyzePosition }) {
  let remoteError = null;
  try {
    const remote = await analyzePosition(fen, difficulty);
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
