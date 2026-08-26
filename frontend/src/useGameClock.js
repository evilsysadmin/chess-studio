import { useEffect, useRef, useState } from 'react';
import { clearClockSnapshot, restoreClockState, saveClockSnapshot } from './clockPersistence.js';
import { playTimePressureSound } from './sound.js';

export function activeClockColor({ busy, humanColor, turn }) {
  return busy ? (humanColor === 'w' ? 'b' : 'w') : turn;
}

export function fallenClockColor(whiteTime, blackTime) {
  if (whiteTime !== null && whiteTime <= 0) return 'w';
  if (blackTime !== null && blackTime <= 0) return 'b';
  return null;
}

export function useGameClock({ game, timeControl, busy, humanColor, forcedOutcome, onPressure }) {
  const hasClock = !!timeControl?.initial;
  const initialClock = restoreClockState(game.id, timeControl, game.turn);
  const [whiteTime, setWhiteTime] = useState(initialClock.whiteTime);
  const [blackTime, setBlackTime] = useState(initialClock.blackTime);
  const [flagFallen, setFlagFallen] = useState(initialClock.flagFallen);
  const lastPersistRef = useRef(0);
  const tickRef = useRef(null);
  const pressureAlertRef = useRef(false);

  useEffect(() => {
    const restored = restoreClockState(game.id, timeControl, game.turn);
    setWhiteTime(restored.whiteTime);
    setBlackTime(restored.blackTime);
    setFlagFallen(restored.flagFallen);
    pressureAlertRef.current = false;
  }, [game.id, timeControl?.id]);

  useEffect(() => {
    if (!hasClock || game.isGameOver || flagFallen || forcedOutcome) return undefined;
    tickRef.current = performance.now();
    const interval = setInterval(() => {
      const now = performance.now();
      const elapsed = (now - tickRef.current) / 1000;
      tickRef.current = now;
      const color = activeClockColor({ busy, humanColor, turn: game.turn });
      if (color === 'w') setWhiteTime((t) => Math.max(0, (t ?? 0) - elapsed));
      else setBlackTime((t) => Math.max(0, (t ?? 0) - elapsed));
    }, 200);
    return () => clearInterval(interval);
  }, [hasClock, game.id, game.isGameOver, flagFallen, forcedOutcome, busy, game.turn, humanColor]);

  useEffect(() => {
    if (!hasClock || whiteTime === null || blackTime === null || game.isGameOver || flagFallen || forcedOutcome) return;
    const now = Date.now();
    if (now - lastPersistRef.current < 900) return;
    lastPersistRef.current = now;
    saveClockSnapshot({
      gameId: game.id,
      timeControlId: timeControl.id,
      whiteTime,
      blackTime,
      activeColor: activeClockColor({ busy, humanColor, turn: game.turn }),
      now,
    });
  }, [whiteTime, blackTime, busy, game.turn, game.id, game.isGameOver, flagFallen, forcedOutcome, hasClock, humanColor, timeControl?.id]);

  useEffect(() => {
    if (game.isGameOver) clearClockSnapshot(game.id);
  }, [game.id, game.isGameOver]);

  useEffect(() => {
    if (!hasClock || flagFallen || game.isGameOver) return;
    const fallen = fallenClockColor(whiteTime, blackTime);
    if (!fallen) return;
    saveClockSnapshot({
      gameId: game.id,
      timeControlId: timeControl.id,
      whiteTime: fallen === 'w' ? 0 : (whiteTime ?? 0),
      blackTime: fallen === 'b' ? 0 : (blackTime ?? 0),
      activeColor: fallen,
    });
    setFlagFallen(fallen);
  }, [whiteTime, blackTime, hasClock, flagFallen, game.isGameOver, game.id, timeControl?.id]);

  useEffect(() => {
    if (!hasClock || pressureAlertRef.current || game.isGameOver || flagFallen || forcedOutcome) return;
    const mine = humanColor === 'w' ? whiteTime : blackTime;
    if (mine !== null && mine <= 30) {
      pressureAlertRef.current = true;
      playTimePressureSound();
      onPressure?.();
    }
  }, [whiteTime, blackTime, hasClock, humanColor, game.isGameOver, flagFallen, forcedOutcome, onPressure]);

  function addIncrement(color) {
    if (!hasClock || !timeControl?.increment) return;
    if (color === 'w') setWhiteTime((t) => (t ?? 0) + timeControl.increment);
    else setBlackTime((t) => (t ?? 0) + timeControl.increment);
  }

  const tickingColor = flagFallen || game.isGameOver || forcedOutcome
    ? null
    : activeClockColor({ busy, humanColor, turn: game.turn });

  return { hasClock, whiteTime, blackTime, flagFallen, setFlagFallen, addIncrement, tickingColor };
}
