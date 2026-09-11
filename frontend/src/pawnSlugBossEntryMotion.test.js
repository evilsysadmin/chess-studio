import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_PANZER_ROOK_ENTRY,
  pawnSlugPanzerRookEntryPose,
} from './pawnSlugBossEntryMotion.js';

describe('Pawn Slug Panzer-Rook entry motion', () => {
  it('starts heavy and settles to a neutral pose', () => {
    const start = pawnSlugPanzerRookEntryPose(0);
    const middle = pawnSlugPanzerRookEntryPose(PAWN_SLUG_PANZER_ROOK_ENTRY.duration * 0.45);
    const end = pawnSlugPanzerRookEntryPose(PAWN_SLUG_PANZER_ROOK_ENTRY.duration + 0.1);

    expect(start.active).toBe(true);
    expect(start.y).toBeGreaterThan(0.15);
    expect(middle.sy).toBeLessThan(1);
    expect(middle.sx).toBeGreaterThan(1);
    expect(Math.abs(middle.rz)).toBeGreaterThan(0);
    expect(end).toMatchObject({ active: false, progress: 1, y: 0, sx: 1, sy: 1, rz: 0 });
  });

  it('uses a neutral pose under reduced motion', () => {
    expect(pawnSlugPanzerRookEntryPose(0.1, { reducedMotion: true }))
      .toMatchObject({ active: false, progress: 1, y: 0, sx: 1, sy: 1, rz: 0 });
  });
});
