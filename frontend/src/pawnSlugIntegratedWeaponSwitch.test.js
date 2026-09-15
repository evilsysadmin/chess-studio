import { describe, expect, it } from 'vitest';
import { pawnSlugIntegratedWeaponId } from './pawnSlugMatthiasIntegratedSprites.js';

describe('Pawn Slug integrated weapon identifiers', () => {
  it.each(['pistol', 'machinegun', 'shotgun', 'panzerfaust'])('keeps %s as an authored weapon bank', (weapon) => {
    expect(pawnSlugIntegratedWeaponId(weapon)).toBe(weapon);
  });
});
