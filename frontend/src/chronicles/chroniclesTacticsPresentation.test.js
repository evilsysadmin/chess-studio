import { describe, expect, it } from 'vitest';
import { chroniclesTacticsLocationLabel } from './chroniclesTacticsPresentation.js';

describe('Chronicles Tactics presentation', () => {
  it('uses the active authored map title instead of a crypt-specific HUD label', () => {
    expect(chroniclesTacticsLocationLabel({ mapId: 'crypt-eight-squares' })).toBe('Cripta de las Ocho Casillas');
    expect(chroniclesTacticsLocationLabel({ mapId: 'gallery-of-forks' })).toBe('Galería de las Horquillas');
    expect(chroniclesTacticsLocationLabel({ mapId: 'menagerie-of-ash' })).toBe('Menagerie de Ceniza');
  });

  it('falls back through the catalog for unknown or missing map ids', () => {
    expect(chroniclesTacticsLocationLabel({ mapId: 'missing-room' })).toBe('Cripta de las Ocho Casillas');
    expect(chroniclesTacticsLocationLabel(null)).toBe('Cripta de las Ocho Casillas');
  });
});
