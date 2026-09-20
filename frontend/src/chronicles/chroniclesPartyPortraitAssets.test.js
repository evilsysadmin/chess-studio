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

  it('falls back to Matthias only for unknown non-party ids', () => {
    expect(chroniclesPartyPortraitUrl('missing')).toBe(
      chroniclesPartyPortraitUrl('matthias'),
    );
  });
});
