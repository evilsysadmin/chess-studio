import { describe, expect, it } from 'vitest';
import {
  CHRONICLES_PREMIUM_BACK_DETAIL_NAMES,
  CHRONICLES_TACTICS_BLENDER_ART_META,
} from './chroniclesOfMatthiasBlenderArt.js';

describe('Chronicles Tactics premium party art', () => {
  it('keeps rear-facing detail on every non-Matthias party silhouette', () => {
    expect(Object.keys(CHRONICLES_PREMIUM_BACK_DETAIL_NAMES)).toEqual(['rook', 'bishop', 'knight']);
    Object.values(CHRONICLES_PREMIUM_BACK_DETAIL_NAMES).forEach((names) => {
      expect(names.length).toBeGreaterThanOrEqual(3);
      expect(new Set(names).size).toBe(names.length);
    });
  });

  it('keeps the Blender producer as the editable source for the party', () => {
    expect(CHRONICLES_TACTICS_BLENDER_ART_META.partySourceOfTruth)
      .toBe('scripts/blender/build_chronicles_tactics_party.py');
    expect(CHRONICLES_TACTICS_BLENDER_ART_META.partyBackDetail)
      .toBe('premium-rear-silhouette-v1');
  });
});
