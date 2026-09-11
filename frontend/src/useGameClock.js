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

export function elapsedClockSeconds({ resumed = false, previousPerf, currentPerf, previousWall, currentWall }) {
  const start = resumed ? Number(previousWall) : Number(previousPerf);
  const end = resumed ? Number(currentWall) : Number(currentPerf);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, end - start) / 1000;
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
    intervalId = setIntervalFn(() => tick({ resumed: false }), intervalMs);
  };
  const onVisibility = () => {
    if (doc?.visibilityState === 'hidden') {
      stop();
      return;
    }
    // A deep mobile sleep may pause performance.now() on some platforms.
    // Reconcile the hidden gap with wall time exactly once, then resume the
    // normal monotonic cadence while the tab is visible.
    tick({ resumed: true });
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
    tickRef.current = { perf: performance.now(), wall: Date.now() };
    const tickClock = ({ resumed = false } = {}) => {
      const currentPerf = performance.now();
      const currentWall = Date.now();
      const previous = tickRef.current || { perf: currentPerf, wall: currentWall };
      const elapsed = elapsedClockSeconds({
        resumed,
        previousPerf: previous.perf,
        currentPerf,
        previousWall: previous.wall,
        currentWall,
      });
      tickRef.current = { perf: currentPerf, wall: currentWall };
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

      if (currentWall - lastPersistRef.current >= 900) {
        lastPersistRef.current = currentWall;
        persistSnapshot(snapshot, color, currentWall);
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
