import { describe, it, expect, beforeEach } from 'vitest';
import { computeMirrorProfile, mirrorDifficulty } from './mirrorMode.js';
import { saveWorstMoveCache } from './worstMoveCache.js';

beforeEach(() => localStorage.clear());

describe('mirrorDifficulty', () => {
  it('un jugador muy preciso (pérdida promedio baja) da una CPU espejo fuerte', () => {
    expect(mirrorDifficulty(10)).toBeGreaterThanOrEqual(90);
  });

  it('un jugador con blunders grandes da una CPU espejo floja', () => {
    expect(mirrorDifficulty(500)).toBeLessThanOrEqual(10);
  });

  it('nunca baja de 5 ni sube de 95, ni en los extremos', () => {
    expect(mirrorDifficulty(0)).toBeLessThanOrEqual(95);
    expect(mirrorDifficulty(100000)).toBeGreaterThanOrEqual(5);
  });

  it('sube de forma monótona según baja la pérdida promedio (menos errores -> CPU más fuerte)', () => {
    const losses = [500, 300, 150, 60, 20];
    const difficulties = losses.map(mirrorDifficulty);
    for (let i = 1; i < difficulties.length; i++) {
      expect(difficulties[i]).toBeGreaterThanOrEqual(difficulties[i - 1]);
    }
  });
});

describe('computeMirrorProfile', () => {
  it('no está listo si hay menos de 3 partidas cacheadas', () => {
    saveWorstMoveCache({
      g1: { worst: { loss: 100 } },
      g2: { worst: { loss: 200 } },
    });
    const profile = computeMirrorProfile();
    expect(profile.ready).toBe(false);
    expect(profile.gamesSampled).toBe(2);
  });

  it('calcula el promedio real de las partidas con loss válido', () => {
    saveWorstMoveCache({
      g1: { worst: { loss: 100 } },
      g2: { worst: { loss: 200 } },
      g3: { worst: { loss: 300 } },
    });
    const profile = computeMirrorProfile();
    expect(profile.ready).toBe(true);
    expect(profile.gamesSampled).toBe(3);
    expect(profile.avgLoss).toBe(200); // (100+200+300)/3
    expect(profile.difficulty).toBe(mirrorDifficulty(200));
  });

  it('ignora las partidas sin mala jugada (worst: null) al calcular el promedio', () => {
    saveWorstMoveCache({
      g1: { worst: { loss: 100 } },
      g2: { worst: null }, // partida perfecta, sin blunder que registrar
      g3: { worst: { loss: 300 } },
      g4: { worst: { loss: 200 } },
    });
    const profile = computeMirrorProfile();
    expect(profile.gamesSampled).toBe(3); // no cuenta la g2
    expect(profile.avgLoss).toBe(200); // (100+300+200)/3, sin la g2
  });

  it('sin ningún dato guardado, da not-ready con 0 partidas', () => {
    const profile = computeMirrorProfile();
    expect(profile.ready).toBe(false);
    expect(profile.gamesSampled).toBe(0);
  });
});
