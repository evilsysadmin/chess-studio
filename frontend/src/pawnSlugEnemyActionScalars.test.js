import { describe, expect, it } from 'vitest';
import {
  pawnSlugEnemyActionForFlags,
  pawnSlugEnemyActionForState,
  pawnSlugEnemyActionPose,
  pawnSlugEnemyActionPoseValues,
  pawnSlugEnemyActionTime,
  pawnSlugEnemyActionTimeValues,
} from './pawnSlugEnemyActionMotion.js';

describe('Pawn Slug enemy action scalar hot paths', () => {
  it('matches object-state action selection exactly', () => {
    const cases = [
      [true, false, false, false, false, false],
      [true, true, true, false, false, false],
      [true, false, true, false, false, false],
      [true, false, false, true, false, false],
      [true, false, false, false, true, false],
      [true, true, true, true, true, true],
    ];
    for (const [moving, hurt, airborne, crouch, climbing, dying] of cases) {
      expect(pawnSlugEnemyActionForFlags(moving, hurt, airborne, crouch, climbing, dying)).toBe(
        pawnSlugEnemyActionForState({ moving, hurt, airborne, crouch, climbing, dying }),
      );
    }
  });

  it('matches object-state action clocks exactly', () => {
    expect(pawnSlugEnemyActionTimeValues('run', 12.3, 12, 0.2)).toBe(
      pawnSlugEnemyActionTime('run', { time: 12.3, hurtStartedAt: 12, deathAge: 0.2 }),
    );
    expect(pawnSlugEnemyActionTimeValues('hurt', 12.3, 12, 0.2)).toBe(
      pawnSlugEnemyActionTime('hurt', { time: 12.3, hurtStartedAt: 12, deathAge: 0.2 }),
    );
    expect(pawnSlugEnemyActionTimeValues('death', 12.3, 12, 0.2)).toBe(
      pawnSlugEnemyActionTime('death', { time: 12.3, hurtStartedAt: 12, deathAge: 0.2 }),
    );
  });

  it('shares the same cached poses through scalar and object APIs', () => {
    const scalar = pawnSlugEnemyActionPoseValues('death', 8, -2, 'knight', 2);
    const objectApi = pawnSlugEnemyActionPose('death', 8, { vy: -2, type: 'knight', variant: 2 });
    expect(scalar).toBe(objectApi);

    const jumpScalar = pawnSlugEnemyActionPoseValues('jump', 3, 4, 'pawn', 0);
    const jumpObject = pawnSlugEnemyActionPose('jump', 3, { vy: 4, type: 'pawn', variant: 0 });
    expect(jumpScalar).toBe(jumpObject);
  });
});
