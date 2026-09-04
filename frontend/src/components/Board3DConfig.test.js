import { describe, expect, it } from 'vitest';
import { BOARD_THEME_3D, resolveBoard3DThemeId } from './Board3DConfig.js';

describe('Board3D theme parity', () => {
  it('supports every Combat campaign board-theme id already published by 2D', () => {
    for (const id of ['combat-jungle', 'combat-urban', 'combat-desert', 'combat-citadel']) {
      expect(BOARD_THEME_3D[id]).toBeTruthy();
      expect(resolveBoard3DThemeId(id, 'classic')).toBe(id);
    }
  });

  it('falls back to the user theme and finally classic for unknown overrides', () => {
    expect(resolveBoard3DThemeId('missing-combat-zone', 'obsidian')).toBe('obsidian');
    expect(resolveBoard3DThemeId('missing-combat-zone', 'also-missing')).toBe('classic');
  });
});
