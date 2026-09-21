// Canonical serializable Combat Chess battle state.
// Keep this module free of React, storage and CPU side effects so the same
// shape can back persistence, recovery and future pure battle transitions.
export function buildCombatBattleState({
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

// Compatibility while callers/tests migrate to the domain name above.
export const buildCombatSessionSnapshot = buildCombatBattleState;
