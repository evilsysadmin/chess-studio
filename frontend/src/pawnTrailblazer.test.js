import { describe, expect, it } from 'vitest';
import {
  TRAIL_COMBO_WINDOW_MS,
  clampTrailLane,
  trailComboAfterCapture,
  trailComboMultiplier,
  trailDuelDecay,
  trailDuelDirection,
  trailDuelPress,
  trailEnemyCapturePoints,
  trailEnemyTypeForDistance,
  trailKnightJumpLane,
  trailPowerLane,
  trailSpeedForDistance,
} from './pawnTrailblazer.js';

describe('Pawn Trailblazer core', () => {
  it('mantiene al peón clavado en su columna sin powerup', () => {
    expect(trailPowerLane({ lane: 2, direction: -1, power: null })).toBe(2);
    expect(trailPowerLane({ lane: 2, direction: 1, power: null })).toBe(2);
  });

  it('torre cruza dos columnas y alfil/dama una', () => {
    expect(trailPowerLane({ lane: 2, direction: 1, power: 'rook' })).toBe(4);
    expect(trailPowerLane({ lane: 2, direction: -1, power: 'bishop' })).toBe(1);
    expect(trailPowerLane({ lane: 2, direction: 1, power: 'queen' })).toBe(3);
    expect(trailPowerLane({ lane: 4, direction: 1, power: 'queen' })).toBe(4);
  });

  it('el remate de un forcejeo siempre conserva una diagonal válida', () => {
    expect(trailDuelDirection(0, -1)).toBe(1);
    expect(trailDuelDirection(4, 1)).toBe(-1);
    expect(trailDuelDirection(2, -1)).toBe(-1);
    expect(trailDuelDirection(2, 1)).toBe(1);
  });

  it('el forcejeo requiere varias pulsaciones y nunca supera 100', () => {
    let meter = 0;
    for (let i = 0; i < 8; i += 1) meter = trailDuelPress(meter);
    expect(meter).toBe(100);
    expect(trailDuelDecay(50, 1)).toBe(42);
  });

  it('la velocidad sube gradualmente pero tiene techo', () => {
    expect(trailSpeedForDistance(0)).toBeCloseTo(5.2);
    expect(trailSpeedForDistance(230)).toBeGreaterThan(7);
    expect(trailSpeedForDistance(9999)).toBe(10.5);
    expect(clampTrailLane(-4)).toBe(0);
    expect(clampTrailLane(99)).toBe(4);
  });

  it('mantiene combo sólo si las capturas llegan dentro de la ventana', () => {
    expect(trailComboAfterCapture(0, 0, 1_000)).toBe(1);
    expect(trailComboAfterCapture(1, 1_000, 1_000 + TRAIL_COMBO_WINDOW_MS - 1)).toBe(2);
    expect(trailComboAfterCapture(4, 1_000, 1_000 + TRAIL_COMBO_WINDOW_MS + 1)).toBe(1);
    expect(trailComboMultiplier(1)).toBe(1);
    expect(trailComboMultiplier(5)).toBe(2);
    expect(trailComboMultiplier(8)).toBe(2.75);
  });

  it('introduce caballo y torre sólo cuando la distancia lo justifica', () => {
    expect(trailEnemyTypeForDistance(20, 0.99)).toBe('pawn');
    expect(trailEnemyTypeForDistance(100, 0.2)).toBe('pawn');
    expect(trailEnemyTypeForDistance(100, 0.9)).toBe('knight');
    expect(trailEnemyTypeForDistance(220, 0.95)).toBe('rook');
    expect(trailEnemyCapturePoints('pawn')).toBe(240);
    expect(trailEnemyCapturePoints('knight')).toBe(320);
    expect(trailEnemyCapturePoints('rook')).toBe(420);
  });

  it('el caballo salta dos columnas buscando la línea de Matthias', () => {
    expect(trailKnightJumpLane(0, 4)).toBe(2);
    expect(trailKnightJumpLane(4, 0)).toBe(2);
    expect(trailKnightJumpLane(2, 4)).toBe(4);
    expect(trailKnightJumpLane(2, 0)).toBe(0);
  });
});
