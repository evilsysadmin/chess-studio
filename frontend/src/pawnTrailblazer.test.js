import { describe, expect, it } from 'vitest';
import {
  clampTrailLane,
  trailDuelDecay,
  trailDuelPress,
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
});
