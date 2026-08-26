import { beforeEach, describe, expect, it } from 'vitest';
import { loadZenMode, saveZenMode, zenModeSummary } from './zenMode.js';


beforeEach(() => localStorage.clear());

describe('modo zen', () => {
  it('persiste por perfil usando un booleano compacto', () => {
    expect(loadZenMode()).toBe(false);
    expect(saveZenMode(true)).toBe(true);
    expect(localStorage.getItem('chess-study-zen-mode')).toBe('1');
    expect(loadZenMode()).toBe(true);
    expect(saveZenMode(false)).toBe(false);
    expect(localStorage.getItem('chess-study-zen-mode')).toBe('0');
    expect(loadZenMode()).toBe(false);
  });

  it('describe claramente qué se oculta', () => {
    expect(zenModeSummary(true)).toContain('sin coordenadas');
    expect(zenModeSummary(true)).toContain('chat');
  });


});
