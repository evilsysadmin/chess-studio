import { describe, expect, it } from 'vitest';
import { createChroniclesState } from '../chroniclesOfMatthias.js';
import { chroniclesTacticsLegalMoves, chroniclesTacticsMove } from '../chroniclesOfMatthiasTactics.js';
import { chroniclesResolveEnemyTurn } from '../chroniclesOfMatthiasTurns.js';
import { chroniclesTacticsResolvePlayerAction } from '../chroniclesTacticsTurnMode.js';
import {
  chroniclesForecastBadge,
  chroniclesForecastDescription,
  chroniclesForecastMove,
  chroniclesForecastMoves,
} from './chroniclesActionForecast.js';
import { chroniclesMapById, chroniclesMapIds } from './chroniclesMapCatalog.js';

function partyHp(state) {
  return state.party.reduce((total, member) => total + Math.max(0, member.hp), 0);
}

function standableCells(mapId) {
  const cells = [];
  chroniclesMapById(mapId).grid.forEach((row, y) => [...row].forEach((tile, x) => {
    if (tile !== '#' && tile !== 'X') cells.push({ x, y });
  }));
  return cells;
}

const BISHOP_ONLY = Object.freeze({
  enemyHp: 0,
  jailerHp: 0,
  spectralBishopHp: 5,
  scavengerHp: 0,
  sigilAwake: true,
});

function bishopState(x, y, patch = {}) {
  return { ...createChroniclesState(), ...BISHOP_ONLY, x, y, ...patch };
}

describe('Chronicles move forecast', () => {
  it('matches the real move -> creature-response pipeline on every map, cell and legal move', () => {
    const tally = { compared: 0, responded: 0, damaging: 0 };
    for (const mapId of chroniclesMapIds()) {
      const opening = createChroniclesState(mapId);
      const midFight = chroniclesResolveEnemyTurn(chroniclesResolveEnemyTurn(opening));
      for (const base of [opening, midFight]) {
        for (const cell of standableCells(mapId)) {
          const state = { ...base, x: cell.x, y: cell.y };
          for (const move of chroniclesTacticsLegalMoves(state)) {
            const next = chroniclesTacticsMove(state, move);
            const actual = chroniclesTacticsResolvePlayerAction(state, next);
            const ran = actual !== next;
            const forecast = chroniclesForecastMove(state, move);

            expect(forecast.responds).toBe(ran);
            if (ran) {
              const events = actual.enemyTurnEvents;
              const attacks = events.filter((event) => event.type === 'attack');
              const moves = events.filter((event) => event.type === 'move');
              expect(forecast.attacks.map((entry) => [entry.enemyId, entry.targetId, entry.hpLost]))
                .toEqual(attacks.map((event) => [event.enemyId, event.targetId, event.fromHp - event.toHp]));
              expect(forecast.advances.map((entry) => [entry.enemyId, entry.to]))
                .toEqual(moves.map((event) => [event.enemyId, event.to]));
              expect(forecast.damage - forecast.trapDamage).toBe(partyHp(next) - partyHp(actual));
              expect(forecast.partyWouldFall).toBe(actual.phase === 'defeated');
              tally.responded += 1;
            } else {
              expect(forecast.attacks).toEqual([]);
              expect(forecast.advances).toEqual([]);
              expect(forecast.partyWouldFall).toBe(next.phase === 'defeated');
            }
            if (forecast.level !== 'calm') tally.damaging += 1;
            tally.compared += 1;
          }
        }
      }
    }
    expect(tally.compared).toBeGreaterThan(500);
    expect(tally.responded).toBeGreaterThan(50);
    expect(tally.damaging).toBeGreaterThan(10);
  });

  it('is silent while exploring and returns null for illegal moves', () => {
    const state = { ...createChroniclesState(), enemyHp: 0, jailerHp: 0, spectralBishopHp: 0, scavengerHp: 0 };
    const forecasts = chroniclesForecastMoves(state);
    expect(Object.keys(forecasts).length).toBeGreaterThan(0);
    for (const forecast of Object.values(forecasts)) {
      expect(forecast).toMatchObject({ responds: false, level: 'calm', damage: 0 });
    }
    expect(chroniclesForecastMove(state, { key: 'north', x: 0, y: 0 })).toBeNull();
    expect(chroniclesForecastMove(null, { key: 'north', x: 1, y: 1 })).toBeNull();
  });

  it('warns about the lane the spectral bishop covers and stays calm on the safe side', () => {
    const state = bishopState(4, 5);
    const forecasts = chroniclesForecastMoves(state);
    expect(forecasts.east).toMatchObject({ level: 'hit', damage: 1 });
    expect(forecasts.east.attacks).toEqual([
      expect.objectContaining({ enemyId: 'spectral-bishop', hpLost: 1, lethal: false }),
    ]);
    expect(forecasts.west.level).toBe('calm');
    expect(chroniclesForecastDescription(state, forecasts.east)).toMatch(/^Aviso: Alfil espectral golpearía a .+ \(−1\)\.$/);
    expect(chroniclesForecastDescription(state, forecasts.west)).toBe('');
  });

  it('escalates to lethal when the blow would drop a member, and to fall when it ends the run', () => {
    const base = createChroniclesState();
    const fragile = bishopState(4, 5, { party: base.party.map((member) => ({ ...member, hp: 1 })) });
    const lethal = chroniclesForecastMoves(fragile).east;
    expect(lethal.level).toBe('lethal');
    expect(chroniclesForecastBadge(lethal)).toBe('−1 †');
    expect(chroniclesForecastDescription(fragile, lethal)).toMatch(/caería\.$/);

    const lastStand = bishopState(4, 5, {
      party: base.party.map((member) => ({ ...member, hp: member.id === 'matthias' ? 1 : 0 })),
    });
    const fall = chroniclesForecastMoves(lastStand).east;
    expect(fall.level).toBe('fall');
    expect(fall.partyWouldFall).toBe(true);
    expect(chroniclesForecastBadge(fall)).toBe('†');
    expect(chroniclesForecastDescription(lastStand, fall)).toBe('Aviso: este movimiento acabaría con la compañía.');
  });

  it('returns nothing once the party cannot act', () => {
    const state = bishopState(4, 5);
    expect(chroniclesForecastMoves({ ...state, phase: 'defeated' })).toEqual({});
    expect(chroniclesForecastMoves({ ...state, phase: 'escaped' })).toEqual({});
    expect(chroniclesForecastMoves({ ...state, turnPhase: 'enemy' })).toEqual({});
  });

  it('does not mutate the state it inspects', () => {
    const state = bishopState(4, 5);
    const before = JSON.stringify(state);
    chroniclesForecastMoves(state);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('badges are empty for calm forecasts and show damage for hits', () => {
    expect(chroniclesForecastBadge(null)).toBe('');
    expect(chroniclesForecastBadge({ level: 'calm', damage: 0 })).toBe('');
    expect(chroniclesForecastBadge({ level: 'hit', damage: 2 })).toBe('−2');
  });
});
