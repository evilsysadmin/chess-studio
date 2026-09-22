import { useCallback } from 'react';
import { buildCombatSessionSnapshot } from './combatControllerSupport.js';

export function useCombatBattleSnapshotFactory({
  fen,
  registry,
  humanColor,
  combatLog,
  uiLogRef,
  autoLevelUpEnabled,
  bossPhase,
  focusRef,
  positionCountsRef,
  bossHpRef,
  battleStartRosterRef,
  battleParticipantsRef,
  unitBattleStatsRef,
  activityGameIdRef,
}) {
  return useCallback(({
    nextFen = fen,
    nextRegistry = registry,
    nextCombatLog = combatLog,
    nextBossHp = bossHpRef.current,
    nextBossPhase = bossPhase,
  } = {}) => buildCombatSessionSnapshot({
    fen: nextFen,
    registry: nextRegistry,
    humanColor,
    combatLog: nextCombatLog,
    uiLog: uiLogRef?.current || [],
    autoLevelUpEnabled,
    focus: focusRef.current,
    positionCounts: positionCountsRef.current.entries(),
    bossHp: nextBossHp,
    bossPhase: nextBossPhase,
    battleStartRoster: battleStartRosterRef.current,
    battleParticipants: battleParticipantsRef.current,
    unitBattleStats: unitBattleStatsRef.current,
    activityGameId: activityGameIdRef.current,
  }), [
    fen,
    registry,
    humanColor,
    combatLog,
    autoLevelUpEnabled,
    bossPhase,
    activityGameIdRef,
  ]);
}
