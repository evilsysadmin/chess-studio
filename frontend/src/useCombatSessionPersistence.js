import { useEffect, useRef } from 'react';
import { clearCombatSession, hasCombatSession, loadCombatSession, saveCombatSession } from './combatSession.js';
import { CPU_DELAY_MS, buildCombatSessionSnapshot } from './combatControllerSupport.js';

export function loadCombatSessionBootstrap(combatSessionId, loader = loadCombatSession) {
  return loader(combatSessionId) || null;
}

export function shouldPersistCombatSession({ phase, hasSnapshot }) {
  return phase === 'battle' && !hasSnapshot;
}

export function shouldResumeCombatCpu({ restoredSession, phase, turn, humanColor }) {
  return Boolean(restoredSession && phase === 'battle' && turn && turn !== humanColor);
}

export function useCombatSessionBootstrap(combatSessionId) {
  const restoredSessionRef = useRef(undefined);
  if (restoredSessionRef.current === undefined) {
    restoredSessionRef.current = loadCombatSessionBootstrap(combatSessionId);
  }
  const restoredSession = restoredSessionRef.current;
  const activityGameIdRef = useRef(restoredSession?.activityGameId || null);
  return { restoredSession, activityGameIdRef };
}

export function useCombatSessionPersistence({
  combatSessionId,
  onPersistenceState,
  restoredSession,
  activityGameIdRef,
  phase,
  fen,
  registry,
  humanColor,
  combatLog,
  uiLogRef,
  autoLevelUpEnabled,
  bossPhase,
  localChess,
  focusRef,
  positionCountsRef,
  bossHpRef,
  battleStartRosterRef,
  battleParticipantsRef,
  unitBattleStatsRef,
  setBusy,
  runCpuTurn,
}) {
  function saveBattleSnapshot(snapshot) {
    onPersistenceState?.('saving');
    const persisted = saveCombatSession(combatSessionId, snapshot);
    onPersistenceState?.(persisted ? 'saved' : 'error');
    return persisted;
  }

  function persistBattleSession({
    nextFen = fen,
    nextRegistry = registry,
    nextCombatLog = combatLog,
    nextBossHp = bossHpRef.current,
    nextBossPhase = bossPhase,
  } = {}) {
    return saveBattleSnapshot(buildCombatSessionSnapshot({
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
    }));
  }

  useEffect(() => {
    if (!shouldPersistCombatSession({ phase, hasSnapshot: hasCombatSession(combatSessionId) })) return;
    persistBattleSession();
  }, [phase, fen, registry, combatLog, bossPhase, humanColor, autoLevelUpEnabled, combatSessionId]);

  useEffect(() => {
    if (!shouldResumeCombatCpu({ restoredSession, phase, turn: localChess.turn(), humanColor })) return undefined;
    setBusy(true);
    const timer = window.setTimeout(
      () => runCpuTurn(fen, registry, humanColor, combatLog),
      Math.min(350, CPU_DELAY_MS),
    );
    return () => window.clearTimeout(timer);
    // El snapshot sólo se consume al montar este controlador.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearBattleSession() {
    clearCombatSession(combatSessionId);
  }

  return { saveBattleSnapshot, persistBattleSession, clearBattleSession };
}
