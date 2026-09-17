import { describe, expect, it } from 'vitest';
import { createWeaponSprite } from './pawnSlugSprites.js';

describe('Pawn Slug separate weapon attachment', () => {
  it('keeps the selected weapon renderable and grip-anchored', () => {
    const weapon = createWeaponSprite('machinegun');
    expect(weapon.type).toBe('Sprite');
    expect(weapon.material).toBeDefined();
    expect(weapon.userData.weaponId).toBe('machinegun');
    expect(weapon.userData.pawnSlugGripAnchored).toBe(true);
    expect(weapon.userData.pawnSlugSeparateWeaponAttachment).toBe(true);
    expect(weapon.userData.pawnSlugIntegratedWeaponShell).toBeUndefined();
    expect(weapon.center.y).toBeCloseTo(0.5);
  });
});
