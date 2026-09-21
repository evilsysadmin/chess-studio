import { describe, expect, it } from 'vitest';
import { MATTHIAS_BASE_AVATAR } from '../matthiasVisuals.js';
import {
  CHRONICLES_PARTY_PORTRAITS,
  chroniclesPartyPortraitUrl,
} from './chroniclesPartyPortraitAssets.js';

describe('Chronicles canonical party portraits', () => {
  it('defines a stable authored portrait for every party member', () => {
    expect(Object.keys(CHRONICLES_PARTY_PORTRAITS).sort()).toEqual([
      'bishop',
      'knight',
      'matthias',
      'rook',
    ]);
    for (const id of ['matthias', 'rook', 'bishop', 'knight']) {
      expect(chroniclesPartyPortraitUrl(id)).toMatch(/chronicles|canonical|webp/i);
    }
  });

  it('uses the shared canonical pawn avatar for Matthias and unknown ids', () => {
    expect(chroniclesPartyPortraitUrl('matthias')).toBe(MATTHIAS_BASE_AVATAR);
    expect(chroniclesPartyPortraitUrl('missing')).toBe(MATTHIAS_BASE_AVATAR);
  });
});
