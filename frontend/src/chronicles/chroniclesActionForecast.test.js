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
            const item = chroniclesForecastMove(state, move);

            expect(item.responds).toBe(ran);
            if (ran) {
              const events = actual.enemyTurnEvents;
              const attacks = events.filter((event) => event.type === 'attack');
              const moves = events.filter((event) => event.type === 'move');
              expect(item.attacks.map((entry) => [entry.enemyId, entry.targetId, entry.hpLost]))
                .toEqual(attacks.map((event) => [event.enemyId, event.targetId, event.fromHp - event.toHp]));
              expect(item.advances.map((entry) => [entry.enemyId, entry.to]))
                .toEqual(moves.map((event) => [event.enemyId, event.to]));
              expect(item.damage - item.trapDamage).toBe(partyHp(next) - partyHp(actual));
              expect(item.partyWouldFall).toBe(actual.phase === 'defeated');
              tally.responded += 1;
            } else {
              expect(item.attacks).toEqual([]);
              expect(item.advances).toEqual([]);
              expect(item.partyWouldFall).toBe(next.phase === 'defeated');
            }
            if (item.level !== 'calm') tally.damaging += 1;
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
    for (const item of Object.values(forecasts)) {
      expect(item).toMatchObject({ responds: false, level: 'calm', damage: 0 });
    }
    expect(chroniclesForecastMove(state, { key: 'north', x: 0, y: 0 })).toBeNull();
  });

  it('warns about the spectral bishop lane', () => {
    const state = bishopState(4, 5);
    const forecasts = chroniclesForecastMoves(state);
    expect(forecasts.east).toMatchObject({ level: 'hit', damage: 1 });
    expect(forecasts.west.level).toBe('calm');
    expect(chroniclesForecastDescription(state, forecasts.east)).toMatch(/^Aviso:/);
  });

  it('escalates lethal and party-fall warnings', () => {
    const base = createChroniclesState();
    const fragile = bishopState(4, 5, { party: base.party.map((member) => ({ ...member, hp: 1 })) });
    const lethal = chroniclesForecastMoves(fragile).east;
    expect(lethal.level).toBe('lethal');
    expect(chroniclesForecastBadge(lethal)).toBe('−1 †');

    const lastStand = bishopState(4, 5, {
      party: base.party.map((member) => ({ ...member, hp: member.id === 'matthias' ? 1 : 0 })),
    });
    const fall = chroniclesForecastMoves(lastStand).east;
    expect(fall.level).toBe('fall');
    expect(chroniclesForecastBadge(fall)).toBe('†');
  });

  it('does not mutate inspected state', () => {
    const state = bishopState(4, 5);
    const before = JSON.stringify(state);
    chroniclesForecastMoves(state);
    expect(JSON.stringify(state)).toBe(before);
  });
});
