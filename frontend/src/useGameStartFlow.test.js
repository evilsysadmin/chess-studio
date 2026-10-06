import { describe, expect, it } from 'vitest';
import {
  gameContextFromOptions,
  labContextFromMeta,
  shouldOfferCasualContract,
} from './useGameStartFlow.js';

describe('game start flow decisions', () => {
  it('normaliza el contexto de partida sin inventar flags', () => {
    expect(gameContextFromOptions({
      rematch: 1,
      adaptiveDifficulty: true,
      runMode: 'boss',
      rescue: true,
    })).toEqual({
      rematch: true,
      adaptiveDifficulty: true,
      runMode: 'boss',
      lab: false,
      rescue: true,
      suddenDeath: false,
      threatCheck: false,
    });
  });

  it('ofrece reto sólo a una partida casual individual', () => {
    expect(shouldOfferCasualContract()).toBe(true);
    expect(shouldOfferCasualContract({ learning: true })).toBe(false);
    expect(shouldOfferCasualContract({ options: { seriesBestOf: 3 } })).toBe(false);
    expect(shouldOfferCasualContract({ options: { lab: true } })).toBe(false);
    expect(shouldOfferCasualContract({ options: { rescue: true } })).toBe(false);
    expect(shouldOfferCasualContract({ options: { runMode: 'streak' } })).toBe(false);
  });

  it('conserva sólo el contexto demostrable al arrancar desde laboratorio', () => {
    expect(labContextFromMeta({
      rescue: true,
      nemesis: true,
      nemesisLabel: 'Caro-Kann',
      nemesisOpening: 'B10',
      sourceRecord: { id: 'game-42' },
    })).toEqual({
      lab: true,
      rescue: true,
      nemesis: true,
      nemesisLabel: 'Caro-Kann',
      nemesisOpening: 'B10',
      sourceRecordId: 'game-42',
    });
  });
});
