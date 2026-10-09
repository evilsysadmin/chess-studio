import { describe, expect, it } from 'vitest';
import { chroniclesRegionHudLocation } from './chroniclesRegionHud.js';

describe('Chronicles region-aware location HUD', () => {
  it('shows Swordhaven instead of a crypt label for a settlement', () => {
    expect(chroniclesRegionHudLocation({
      id: 'swordhaven-square', regionKind: 'settlement', title: 'Swordhaven · Plaza del Alba',
    })).toEqual({ kind: 'PUEBLO', value: 'SWORDHAVEN' });
  });
  it('does not call a wilderness road a crypt', () => {
    expect(chroniclesRegionHudLocation({
      regionKind: 'wilderness', title: 'Camino del Molino',
    })).toEqual({ kind: 'EXTERIOR', value: 'CAMINO DEL MOLINO' });
  });
  it('preserves existing dungeon labels', () => {
    expect(chroniclesRegionHudLocation({ id: 'crypt-eight-squares' })).toEqual({
      kind: 'CRIPTA', value: '01',
    });
  });
});
