import { describe, expect, it } from 'vitest';
import { combatModeLabel, gameModeFromContext, gameModeLabel } from './gameModes.js';

describe('gameModes', () => {
  it('labels every stored standard mode without falling back to Torneo', () => {
    expect(gameModeLabel({ mode: 'sudden' })).toBe('Muerte súbita');
    expect(gameModeLabel({ mode: 'cup' })).toBe('Copa de 8');
    expect(gameModeLabel({ mode: 'casual' })).toBe('Partida rápida');
  });

  it('distinguishes campaign, tower, endless and free Combat Chess', () => {
    expect(combatModeLabel({ log: [], variant: 'roguelike', roguelikeMode: 'campaign' })).toBe('Combat Chess · Campaña');
    expect(combatModeLabel({ log: [], variant: 'roguelike', roguelikeMode: 'tower' })).toBe('Combat Chess · Torre');
    expect(combatModeLabel({ log: [], variant: 'roguelike', roguelikeMode: 'endless' })).toBe('Combat Chess · Torre infinita');
    expect(combatModeLabel({ log: [], variant: 'combat' })).toBe('Combat Chess · Batalla libre');
  });

  it('derives the normal game mode from the active context', () => {
    expect(gameModeFromContext({ gameContext: { runMode: 'cup' } })).toBe('cup');
    expect(gameModeFromContext({ gameContext: { suddenDeath: true } })).toBe('sudden');
    expect(gameModeFromContext({ learningMode: true })).toBe('practice');
  });
});
