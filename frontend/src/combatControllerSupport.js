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
  return { killsByIdentity: {}, bossDamageByIdentity: {}, bossFinisherIdentityId: null };
}

export function incrementIdentityCounter(bucket, identityId, amount = 1) {
  if (!identityId || !Number.isFinite(Number(amount)) || Number(amount) <= 0) return bucket;
  return { ...bucket, [identityId]: (bucket[identityId] || 0) + Number(amount) };
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
