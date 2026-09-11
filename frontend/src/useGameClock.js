import { useEffect, useRef, useState } from 'react';
import { clearClockSnapshot, restoreClockState, saveClockSnapshot } from './clockPersistence.js';
import { playTimePressureSound } from './sound.js';
import { createClockRuntime } from './clockRuntime.js';

export function activeClockColor({ busy, humanColor, turn }) {
  return busy ? (humanColor === 'w' ? 'b' : 'w') : turn;
}

export function fallenClockColor(whiteTime, blackTime) {
  if (whiteTime !== null && whiteTime <= 0) return 'w';
  if (blackTime !== null && blackTime <= 0) return 'b';
  return null;
}

export function createVisibleClockTicker({
  tick,
  intervalMs = 200,
  doc = typeof document !== 'undefined' ? document : null,
  setIntervalFn = globalThis.setInterval,
  clearIntervalFn = globalThis.clearInterval,
} = {}) {
  if (typeof tick !== 'function') return () => {};

  let intervalId = null;
  const stop = () => {
    if (intervalId === null) return;
    clearIntervalFn(intervalId);
    intervalId = null;
  };
  const start = () => {
    if (intervalId !== null || doc?.visibilityState === 'hidden') return;
    intervalId = setIntervalFn(tick, intervalMs);
  };
  const onVisibility = () => {
    if (doc?.visibilityState === 'hidden') {
      stop();
      return;
    }
    // Reconcile the whole wall-clock gap immediately when the tab becomes
    // visible again, then resume the normal 200 ms cadence.
    tick();
    start();
  };

  doc?.addEventListener?.('visibilitychange', onVisibility);
  start();

  return () => {
    stop();
    doc?.removeEventListener?.('visibilitychange', onVisibility);
  };
}

export function useGameClock({ game, timeControl, busy, humanColor, forcedOutcome, onPressure }) {
  const hasClock = !!timeControl?.initial;
  const runtimeRef = useRef(null);
  if (!runtimeRef.current) {
    const initialClock = restoreClockState(game.id, timeControl, game.turn);
    runtimeRef.current = createClockRuntime({
      ...initialClock,
      tickingColor: initialClock.flagFallen ? null : game.turn,
    });
  }
  const runtime = runtimeRef.current;
  const [flagFallen, setFlagFallenState] = useState(() => runtime.getSnapshot().flagFallen);
  const lastPersistRef = useRef(0);
  const tickRef = useRef(null);
  const pressureAlertRef = useRef(false);
  const onPressureRef = useRef(onPressure);
  onPressureRef.current = onPressure;

  function persistSnapshot(snapshot, activeColor, now = Date.now()) {
    if (!hasClock || snapshot.whiteTime === null || snapshot.blackTime === null) return;
    saveClockSnapshot({
      gameId: game.id,
      timeControlId: timeControl.id,
      whiteTime: snapshot.whiteTime,
      blackTime: snapshot.blackTime,
      activeColor,
      now,
    });
  }

  useEffect(() => {
    const restored = restoreClockState(game.id, timeControl, game.turn);
    runtime.replace({
      ...restored,
      tickingColor: restored.flagFallen || game.isGameOver || forcedOutcome ? null : game.turn,
    });
    setFlagFallenState(restored.flagFallen);
    pressureAlertRef.current = false;
    lastPersistRef.current = 0;
  }, [game.id, timeControl?.id, runtime]);

  useEffect(() => {
    if (!hasClock || game.isGameOver || flagFallen || forcedOutcome) {
      runtime.setTickingColor(null);
      return undefined;
    }
    runtime.setTickingColor(activeClockColor({ busy, humanColor, turn: game.turn }));
    tickRef.current = performance.now();
    const tickClock = () => {
      const now = performance.now();
      const elapsed = (now - tickRef.current) / 1000;
      tickRef.current = now;
      const color = activeClockColor({ busy, humanColor, turn: game.turn });
      let snapshot = runtime.advance(color, elapsed);
      const fallen = fallenClockColor(snapshot.whiteTime, snapshot.blackTime);
      if (fallen) {
        snapshot = runtime.setFlagFallen(fallen);
        persistSnapshot(snapshot, fallen);
        setFlagFallenState(fallen);
        return;
      }

      const mine = humanColor === 'w' ? snapshot.whiteTime : snapshot.blackTime;
      if (!pressureAlertRef.current && mine !== null && mine <= 30) {
        pressureAlertRef.current = true;
        playTimePressureSound();
        onPressureRef.current?.();
      }

      const wallNow = Date.now();
      if (wallNow - lastPersistRef.current >= 900) {
        lastPersistRef.current = wallNow;
        persistSnapshot(snapshot, color, wallNow);
      }
    };
    const stopTicker = createVisibleClockTicker({ tick: tickClock });
    return () => {
      stopTicker();
      persistSnapshot(runtime.getSnapshot(), activeClockColor({ busy, humanColor, turn: game.turn }));
    };
  }, [hasClock, game.id, game.isGameOver, flagFallen, forcedOutcome, busy, game.turn, humanColor, timeControl?.id, runtime]);

  useEffect(() => {
    if (game.isGameOver) clearClockSnapshot(game.id);
  }, [game.id, game.isGameOver]);

  function addIncrement(color) {
    if (!hasClock || !timeControl?.increment) return;
    const snapshot = runtime.addIncrement(color, timeControl.increment);
    // La confirmación de una jugada llega desde una función async que puede
    // conservar props de un render anterior. El runtime sí conoce el reloj que
    // está corriendo ahora, así que evitamos persistir el turno activo obsoleto.
    const activeColor = snapshot.tickingColor || activeClockColor({ busy, humanColor, turn: game.turn });
    persistSnapshot(snapshot, activeColor);
  }

  function setFlagFallen(color) {
    runtime.setFlagFallen(color);
    setFlagFallenState(color);
  }

  return {
    hasClock,
    flagFallen,
    setFlagFallen,
    addIncrement,
    getTime: runtime.getTime,
    runtime,
  };
}
