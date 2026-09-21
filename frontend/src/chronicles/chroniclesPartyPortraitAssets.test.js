import { describe, expect, it } from 'vitest';
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

  it('uses the dedicated Chronicles portrait for Matthias and unknown ids', () => {
    expect(chroniclesPartyPortraitUrl('matthias')).toBe(CHRONICLES_PARTY_PORTRAITS.matthias);
    expect(chroniclesPartyPortraitUrl('missing')).toBe(CHRONICLES_PARTY_PORTRAITS.matthias);
  });
});
