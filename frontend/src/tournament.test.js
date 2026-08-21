import { describe, it, expect } from 'vitest';
import {
  levelForPoints,
  difficultyForLevel,
  hintCost,
  puzzleRetryCost,
  capturePoints,
  applyCaptureReward,
  streakBonus,
  applyResult,
  POINTS_PER_LEVEL,
} from './tournament.js';

describe('nivel y dificultad', () => {
  it('nivel 1 con 0 puntos, sube cada POINTS_PER_LEVEL puntos', () => {
    expect(levelForPoints(0)).toBe(1);
    expect(levelForPoints(POINTS_PER_LEVEL)).toBe(2);
    expect(levelForPoints(POINTS_PER_LEVEL * 3)).toBe(4);
  });

  it('la dificultad de la CPU escala con el nivel y tiene techo en 100', () => {
    expect(difficultyForLevel(1)).toBe(0);
    expect(difficultyForLevel(13)).toBe(35);
    expect(difficultyForLevel(24)).toBe(48); // el antiguo ~62 era demasiado agresivo con el motor actual
    expect(difficultyForLevel(101)).toBe(100);
  });

  it('el techo no se alcanza demasiado temprano (el problema real que se reportó)', () => {
    // Con la curva lineal original, el nivel 14 ya tocaba el techo — toda
    // la progresión restante del torneo era jugar siempre al máximo. Acá
    // confirmamos que en niveles tempranos/medios queda margen de verdad.
    expect(difficultyForLevel(14)).toBeLessThan(90);
    expect(difficultyForLevel(30)).toBeLessThan(90);
  });
});

describe('hintCost', () => {
  it('escala con el nivel y con cuántas pistas ya se pidieron esta partida', () => {
    const first = hintCost(1, 0);
    const second = hintCost(1, 1);
    expect(second).toBeGreaterThan(first);
  });
});

describe('puzzleRetryCost', () => {
  it('tiene un costo base incluso con racha 0', () => {
    expect(puzzleRetryCost(0)).toBe(8);
  });

  it('escala con el largo de la racha que se está protegiendo', () => {
    expect(puzzleRetryCost(10)).toBeGreaterThan(puzzleRetryCost(1));
    expect(puzzleRetryCost(5)).toBe(8 + 5 * 2);
  });
});

describe('capturePoints', () => {
  it('una captura "trivial" (pieza fuerte come una floja) no lleva bono', () => {
    const points = capturePoints('q', 'p', 1);
    expect(points).toBe(1); // solo el valor del peón, sin bono
  });

  it('una captura "difícil" (pieza floja come una fuerte) lleva bono extra', () => {
    const trivial = capturePoints('q', 'p', 1);
    const dificil = capturePoints('p', 'q', 1);
    expect(dificil).toBeGreaterThan(trivial);
  });

  it('escala con el nivel del torneo', () => {
    const nivelBajo = capturePoints('n', 'p', 1);
    const nivelAlto = capturePoints('n', 'p', 20);
    expect(nivelAlto).toBeGreaterThan(nivelBajo);
  });

  it('las capturas sólo suman moneda de pistas, no XP/nivel de torneo', () => {
    const base = { points: 10, progressPoints: 95, wins: 0, draws: 0, losses: 0 };
    const next = applyCaptureReward(base, 9);
    expect(next.points).toBe(19);
    expect(next.progressPoints).toBe(95);
    expect(levelForPoints(next.progressPoints)).toBe(levelForPoints(base.progressPoints));
  });
});

describe('streakBonus', () => {
  it('no da bono en la primera captura de la racha', () => {
    expect(streakBonus(1, 5)).toBe(0);
  });

  it('da más bono cuanto más larga la racha', () => {
    expect(streakBonus(3, 5)).toBeGreaterThan(streakBonus(2, 5));
  });
});

describe('applyResult', () => {
  it('ganar da más progreso que empatar, pero el resultado NO fabrica moneda de pistas', () => {
    const base = { points: 17, progressPoints: 0, wins: 0, draws: 0, losses: 0 };
    const win = applyResult(base, 'win');
    const draw = applyResult(base, 'draw');
    const loss = applyResult(base, 'loss');
    expect(win.gained).toBeGreaterThan(draw.gained);
    expect(draw.gained).toBeGreaterThan(loss.gained);
    expect(win.state.points).toBe(17);
    expect(draw.state.points).toBe(17);
    expect(loss.state.points).toBe(17);
    expect(win.state.progressPoints).toBe(20);
  });

  it('detecta correctamente cuando se sube de nivel', () => {
    const base = { points: 0, progressPoints: POINTS_PER_LEVEL - 5, wins: 0, draws: 0, losses: 0 };
    const result = applyResult(base, 'win'); // gana 20, cruza el umbral
    expect(result.leveledUp).toBe(true);
  });

  it('la racha de victorias sube con cada victoria consecutiva', () => {
    let state = { points: 0, progressPoints: 0, wins: 0, draws: 0, losses: 0, winStreak: 0, bestWinStreak: 0 };
    state = applyResult(state, 'win').state;
    state = applyResult(state, 'win').state;
    state = applyResult(state, 'win').state;
    expect(state.winStreak).toBe(3);
    expect(state.bestWinStreak).toBe(3);
  });

  it('una derrota o unas tablas rompen la racha de victorias', () => {
    let state = { points: 0, progressPoints: 0, wins: 0, draws: 0, losses: 0, winStreak: 0, bestWinStreak: 0 };
    state = applyResult(state, 'win').state;
    state = applyResult(state, 'win').state;
    state = applyResult(state, 'draw').state;
    expect(state.winStreak).toBe(0);
    expect(state.bestWinStreak).toBe(2); // la mejor marca no se pierde

    state = applyResult(state, 'loss').state;
    expect(state.winStreak).toBe(0);
  });

  it('la mejor racha nunca baja, aunque la racha actual se rompa y vuelva a crecer más chica', () => {
    let state = { points: 0, progressPoints: 0, wins: 0, draws: 0, losses: 0, winStreak: 0, bestWinStreak: 0 };
    for (let i = 0; i < 5; i++) state = applyResult(state, 'win').state;
    expect(state.bestWinStreak).toBe(5);
    state = applyResult(state, 'loss').state;
    state = applyResult(state, 'win').state;
    expect(state.winStreak).toBe(1);
    expect(state.bestWinStreak).toBe(5); // se mantiene
  });

  it('funciona con estado viejo que no tenía winStreak/bestWinStreak todavía (sin migración)', () => {
    const oldState = { points: 100, wins: 5, draws: 1, losses: 2 }; // sin los campos nuevos
    const result = applyResult(oldState, 'win');
    expect(result.state.winStreak).toBe(1);
    expect(result.state.bestWinStreak).toBe(1);
  });
});
