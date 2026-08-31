import { describe, expect, it } from 'vitest';
import { trailPowerLane } from '../pawnTrailblazer.js';

describe('Pawn Trailblazer interaction contract', () => {
  it('sin powerup no permite cambio lateral libre', () => {
    expect(trailPowerLane({ lane: 1, direction: 1, power: null })).toBe(1);
  });
});
