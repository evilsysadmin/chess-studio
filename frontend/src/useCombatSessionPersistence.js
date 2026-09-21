import { useEffect, useRef } from 'react';
import { clearCombatSession, hasCombatSession, hasCombatSessionMarker, loadCombatSession, saveCombatSession } from './combatSession.js';
import { CPU_DELAY_MS } from './combatControllerSupport.js';

export function loadCombatSessionBootstrap(combatSessionId, loader = loadCombatSession) {
  return loader(combatSessionId) || null;
}

export function combatSessionRecoveryState(combatSessionId, {
  loader = loadCombatSession,
  markerLoader = hasCombatSessionMarker,
} = {}) {
  const restoredSession = loadCombatSessionBootstrap(combatSessionId, loader);
  return {
    restoredSession,
    missingSession: !restoredSession && markerLoader(combatSessionId),
  };
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
    restoredSessionRef.current = combatSessionRecoveryState(combatSessionId);
  }
  const { restoredSession, missingSession } = restoredSessionRef.current;
  const activityGameIdRef = useRef(restoredSession?.activityGameId || null);
  return { restoredSession, missingSession, activityGameIdRef };
}

export function useCombatSessionPersistence({
  combatSessionId,
  onPersistenceState,
  restoredSession,
  phase,
  currentTurn,
  readBattleState,
  setBusy,
  runCpuTurn,
}) {
  function persistBattleSession(overrides = {}) {
    onPersistenceState?.('saving');
    const persisted = saveCombatSession(combatSessionId, readBattleState(overrides));
    onPersistenceState?.(persisted ? 'saved' : 'error');
    return persisted;
  }

  useEffect(() => {
    if (!shouldPersistCombatSession({ phase, hasSnapshot: hasCombatSession(combatSessionId) })) return;
    persistBattleSession();
  }, [phase, combatSessionId, readBattleState]);

  useEffect(() => {
    const restoredHumanColor = restoredSession?.humanColor;
    if (!shouldResumeCombatCpu({
      restoredSession,
      phase,
      turn: currentTurn,
      humanColor: restoredHumanColor,
    })) return undefined;

    setBusy(true);
    const timer = window.setTimeout(
      () => runCpuTurn(
        restoredSession.fen,
        restoredSession.registry,
        restoredHumanColor,
        restoredSession.combatLog || [],
      ),
      Math.min(350, CPU_DELAY_MS),
    );
    return () => window.clearTimeout(timer);
    // El snapshot sólo se consume al montar este controlador.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearBattleSession() {
    clearCombatSession(combatSessionId);
  }

  return { persistBattleSession, clearBattleSession };
}
