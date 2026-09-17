import { describe, expect, it } from 'vitest';
import { createChroniclesState } from './chroniclesOfMatthias.js';
import {
  chroniclesTacticsCombatActive,
  chroniclesTacticsResolvePlayerAction,
} from './chroniclesTacticsTurnMode.js';

function tacticsState(overrides = {}) {
  return {
    ...createChroniclesState(),
    round: 1,
    turnPhase: 'party',
    enemyPositions: {},
    enemyTurnEvents: [],
    ...overrides,
  };
}

describe('Chronicles Tactics turn-based combat mode', () => {
  it('keeps free exploration outside enemy engagement range', () => {
    const initial = tacticsState();
    const explorationStep = { ...initial, x: 1, y: 4, turns: 1, message: 'Exploración.' };

    expect(chroniclesTacticsCombatActive(initial)).toBe(false);
    const resolved = chroniclesTacticsResolvePlayerAction(initial, explorationStep);
    expect(resolved).toBe(explorationStep);
    expect(resolved.round).toBe(1);
    expect(resolved.enemyTurnEvents).toEqual([]);
  });

  it('hands the turn to enemies when movement enters combat range', () => {
    const initial = tacticsState();
    const engagedStep = { ...initial, x: 2, y: 5, turns: 1, message: 'Contacto.' };

    expect(chroniclesTacticsCombatActive(engagedStep)).toBe(true);
    const resolved = chroniclesTacticsResolvePlayerAction(initial, engagedStep);
    expect(resolved).not.toBe(engagedStep);
    expect(resolved.round).toBe(2);
    expect(resolved.turnPhase).toBe('party');
    expect(resolved.enemyTurnEvents.some((event) => event.type === 'attack')).toBe(true);
  });

  it('lets an explicit attack start a turn even from outside passive engagement range', () => {
    const initial = tacticsState();
    const aggressiveAction = { ...initial, turns: 1, message: 'Disparo preventivo.' };

    const resolved = chroniclesTacticsResolvePlayerAction(initial, aggressiveAction, { forceCombat: true });
    expect(resolved.round).toBe(2);
    expect(resolved.enemyTurnEvents.length).toBeGreaterThan(0);
    expect(resolved.turnPhase).toBe('party');
  });
});
