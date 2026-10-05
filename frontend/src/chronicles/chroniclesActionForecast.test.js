import { describe, expect, it } from 'vitest';
import { createChroniclesState } from '../chroniclesOfMatthias.js';
import { chroniclesTacticsLegalMoves } from '../chroniclesOfMatthiasTactics.js';
import {
  chroniclesForecastBadge,
  chroniclesForecastDescription,
  chroniclesForecastMove,
  chroniclesForecastMoves,
} from './chroniclesActionForecast.js';

function initiativeState(order, cursor = 0, patch = {}) {
  return {
    ...createChroniclesState(),
    phase: 'combat',
    initiative: {
      version: 1,
      die: '1d8',
      round: 2,
      cursor,
      order,
    },
    ...patch,
  };
}

const ROOK = Object.freeze({
  id: 'rook',
  kind: 'party',
  name: 'Hildegard',
  agility: 3,
  roll: 5,
  initiative: 8,
});

const PAWN = Object.freeze({
  id: 'corrupted-pawn',
  kind: 'enemy',
  name: 'Peón corrompido',
  agility: 2,
  roll: 4,
  initiative: 6,
});

const BISHOP = Object.freeze({
  id: 'bishop',
  kind: 'party',
  name: 'Aziz',
  agility: 2,
  roll: 3,
  initiative: 5,
});

describe('Chronicles move forecast', () => {
  it('marks an exploration step that starts combat without pretending the initiative roll is known', () => {
    const state = createChroniclesState();
    const east = chroniclesTacticsLegalMoves(state).find((move) => move.key === 'east');
    const forecast = chroniclesForecastMove(state, east);

    expect(forecast).toMatchObject({
      startsCombat: true,
      responds: false,
      level: 'combat',
      damage: 0,
    });
    expect(chroniclesForecastBadge(forecast)).toBe('⚔');
    expect(chroniclesForecastDescription(state, forecast)).toMatch(/AGI \+ 1d8/i);
  });

  it('previews only the next enemy actor during an active initiative round', () => {
    const state = initiativeState([ROOK, PAWN, BISHOP]);
    const east = chroniclesTacticsLegalMoves(state).find((move) => move.key === 'east');
    const forecast = chroniclesForecastMove(state, east);

    expect(forecast.startsCombat).toBe(false);
    expect(forecast.responds).toBe(true);
    expect(forecast.attacks).toHaveLength(1);
    expect(forecast.attacks[0]).toMatchObject({
      enemyId: 'corrupted-pawn',
      hpLost: 1,
    });
    expect(forecast.damage).toBe(1);
    expect(chroniclesForecastDescription(state, forecast)).toMatch(/actuaría después/i);
  });

  it('does not invent an enemy response when the next initiative actor is another hero', () => {
    const state = initiativeState([ROOK, BISHOP, PAWN]);
    const east = chroniclesTacticsLegalMoves(state).find((move) => move.key === 'east');
    const forecast = chroniclesForecastMove(state, east);

    expect(forecast).toMatchObject({
      startsCombat: false,
      responds: false,
      level: 'calm',
      damage: 0,
    });
    expect(forecast.attacks).toEqual([]);
    expect(forecast.advances).toEqual([]);
  });

  it('is silent on enemy turns and returns null for illegal moves', () => {
    const enemyTurn = initiativeState([ROOK, PAWN], 1);
    expect(chroniclesForecastMoves(enemyTurn)).toEqual({});

    const exploration = {
      ...createChroniclesState(),
      enemyHp: 0,
      jailerHp: 0,
      spectralBishopHp: 0,
      scavengerHp: 0,
    };
    expect(chroniclesForecastMove(exploration, { key: 'north', x: 0, y: 0 })).toBeNull();
  });

  it('does not mutate inspected state', () => {
    const state = initiativeState([ROOK, PAWN, BISHOP]);
    const before = JSON.stringify(state);
    chroniclesForecastMoves(state);
    expect(JSON.stringify(state)).toBe(before);
  });
});
