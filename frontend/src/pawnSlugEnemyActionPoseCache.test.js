import { describe, expect, it } from 'vitest';
import { pawnSlugEnemyActionPose } from './pawnSlugEnemyActionMotion.js';

describe('Pawn Slug enemy action pose cache', () => {
  it('reuses immutable poses for the same discrete animation state', () => {
    const first = pawnSlugEnemyActionPose('run', 5, { type: 'knight' });
    const second = pawnSlugEnemyActionPose('run', 5, { type: 'knight' });

    expect(second).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it('keeps jump ascent and descent as separate cached poses', () => {
    const up = pawnSlugEnemyActionPose('jump', 4, { type: 'pawn', vy: 3 });
    const upAgain = pawnSlugEnemyActionPose('jump', 4, { type: 'pawn', vy: 1 });
    const down = pawnSlugEnemyActionPose('jump', 4, { type: 'pawn', vy: -3 });

    expect(upAgain).toBe(up);
    expect(down).not.toBe(up);
    expect(down.y).not.toBe(up.y);
  });

  it('keeps death variants isolated while reusing each variant', () => {
    const first = pawnSlugEnemyActionPose('death', 8, { type: 'rook', variant: 0 });
    const firstAgain = pawnSlugEnemyActionPose('death', 8, { type: 'rook', variant: 0 });
    const alternate = pawnSlugEnemyActionPose('death', 8, { type: 'rook', variant: 1 });

    expect(firstAgain).toBe(first);
    expect(alternate).not.toBe(first);
    expect(alternate.rz).not.toBe(first.rz);
  });
});
