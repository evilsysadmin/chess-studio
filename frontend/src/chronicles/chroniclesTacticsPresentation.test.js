import { describe, expect, it } from 'vitest';
import {
  chroniclesTacticsLocationLabel,
  chroniclesTacticsMoveAvailability,
} from './chroniclesTacticsPresentation.js';

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
  it('enables only movement controls backed by a real legal destination', () => {
    const state = { x: 2, y: 2, phase: 'explore', turnPhase: 'party' };
    expect(chroniclesTacticsMoveAvailability(state, [
      { x: 1, y: 2 },
      { x: 2, y: 1 },
    ])).toEqual({
      west: true,
      north: true,
      south: false,
      east: false,
    });
  });

  it('disables movement controls while the enemy owns the turn', () => {
    const state = { x: 2, y: 2, phase: 'explore', turnPhase: 'enemy' };
    expect(chroniclesTacticsMoveAvailability(state, [
      { x: 3, y: 2 },
    ])).toEqual({
      west: false,
      north: false,
      south: false,
      east: false,
    });
  });

});
