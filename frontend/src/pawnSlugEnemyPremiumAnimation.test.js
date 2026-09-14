import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_ENEMY_ACTION_META,
  PAWN_SLUG_ENEMY_RUN_RATE_BY_TYPE,
  pawnSlugEnemyActionFrame,
  pawnSlugEnemyActionPose,
} from './pawnSlugEnemyActionMotion.js';

describe('Pawn Slug premium enemy locomotion', () => {
  it('runs each soldier class at a visibly readable gait cadence', () => {
    expect(PAWN_SLUG_ENEMY_RUN_RATE_BY_TYPE.knight).toBeGreaterThanOrEqual(36);
    expect(PAWN_SLUG_ENEMY_RUN_RATE_BY_TYPE.pawn).toBeGreaterThanOrEqual(28);
    expect(PAWN_SLUG_ENEMY_RUN_RATE_BY_TYPE.rook).toBeGreaterThanOrEqual(20);
    expect(PAWN_SLUG_ENEMY_RUN_RATE_BY_TYPE.knight).toBeGreaterThan(PAWN_SLUG_ENEMY_RUN_RATE_BY_TYPE.pawn);
    expect(PAWN_SLUG_ENEMY_RUN_RATE_BY_TYPE.pawn).toBeGreaterThan(PAWN_SLUG_ENEMY_RUN_RATE_BY_TYPE.rook);

    const at = 0.2;
    expect(pawnSlugEnemyActionFrame('run', at, 'knight')).not.toBe(pawnSlugEnemyActionFrame('run', at, 'pawn'));
    expect(pawnSlugEnemyActionFrame('run', at, 'pawn')).not.toBe(pawnSlugEnemyActionFrame('run', at, 'rook'));
  });

  it('uses planted and airborne stride beats instead of a near-static bob', () => {
    const plant = pawnSlugEnemyActionPose('run', 0, { type: 'pawn' });
    const forward = pawnSlugEnemyActionPose('run', 4, { type: 'pawn' });
    const reverse = pawnSlugEnemyActionPose('run', 12, { type: 'pawn' });

    expect(forward.y - plant.y).toBeGreaterThan(0.08);
    expect(forward.x).toBeGreaterThan(0.04);
    expect(reverse.x).toBeLessThan(-0.04);
    expect(forward.rz).toBeLessThan(-0.05);
    expect(reverse.rz).toBeGreaterThan(0.05);
    expect(plant.sy).toBeLessThan(0.96);
  });

  it('gives assault and heavy enemies distinct body language', () => {
    const knight = pawnSlugEnemyActionPose('run', 4, { type: 'knight' });
    const rook = pawnSlugEnemyActionPose('run', 4, { type: 'rook' });
    expect(Math.abs(knight.x)).toBeGreaterThan(Math.abs(rook.x) * 2);
    expect(Math.abs(knight.rz)).toBeGreaterThan(Math.abs(rook.rz) * 2);
    expect(knight.y).toBeGreaterThan(rook.y);
    expect(PAWN_SLUG_ENEMY_ACTION_META.runStyleByType).toEqual({
      pawn: 'rifle-stride',
      knight: 'assault-charge',
      rook: 'heavy-stomp',
    });
  });

  it('breathes and shifts guard while idle instead of hovering as one rigid card', () => {
    const neutral = pawnSlugEnemyActionPose('idle', 0, { type: 'pawn' });
    const quarter = pawnSlugEnemyActionPose('idle', 3, { type: 'pawn' });
    const inhale = pawnSlugEnemyActionPose('idle', 6, { type: 'pawn' });

    expect(Math.abs(quarter.rz - neutral.rz)).toBeGreaterThan(0.01);
    expect(inhale.sy).toBeGreaterThan(neutral.sy + 0.01);
    expect(PAWN_SLUG_ENEMY_ACTION_META.locomotionVersion).toBe('premium-weight-shift-v2');
  });
});
