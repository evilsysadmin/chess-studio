import { describe, expect, it } from 'vitest';
import { createWeaponSprite } from './pawnSlugSprites.js';

describe('Pawn Slug integrated weapon compatibility shell', () => {
  it('does not carry renderable weapon geometry', () => {
    const shell = createWeaponSprite('machinegun');
    expect(shell.userData.pawnSlugIntegratedWeaponShell).toBe(true);
    expect(shell.children).toHaveLength(0);
    expect(shell.material).toBeUndefined();
    expect(shell.geometry).toBeUndefined();
  });
});
