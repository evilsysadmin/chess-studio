import { describe, expect, it } from 'vitest';
import { createChroniclesState } from './chroniclesOfMatthias.js';
import {
  chroniclesTacticsCombatActive,
  chroniclesTacticsCurrentActor,
  chroniclesTacticsPartyCanAct,
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
    expect(resolved.initiative).toBeNull();
    expect(resolved.enemyTurnEvents).toEqual([]);
  });

  it('freezes exploration and rolls initiative when movement enters combat range', () => {
    const initial = tacticsState();
    const engagedStep = { ...initial, x: 2, y: 5, turns: 1, message: 'Contacto.' };

    expect(chroniclesTacticsCombatActive(engagedStep)).toBe(true);
    const resolved = chroniclesTacticsResolvePlayerAction(initial, engagedStep, { random: () => 0 });

    expect(resolved.phase).toBe('combat');
    expect(resolved.initiative?.die).toBe('1d8');
    expect(resolved.initiative?.order.length).toBeGreaterThan(1);
    expect(resolved.enemyTurnEvents).toEqual([]);
    expect(resolved.message).toMatch(/iniciativa = AGI \+ 1d8/i);
  });

  it('rolls before movement when a restored legacy state is already engaged', () => {
    const engaged = tacticsState({ x: 2, y: 5 });
    const attemptedEscape = { ...engaged, x: 1, y: 5, turns: 1, message: 'Huida gratis.' };

    const resolved = chroniclesTacticsResolvePlayerAction(engaged, attemptedEscape, { random: () => 0 });

    expect(resolved.phase).toBe('combat');
    expect({ x: resolved.x, y: resolved.y }).toEqual({ x: 2, y: 5 });
    expect(resolved.turns).toBe(engaged.turns);
  });

  it('starts ranged combat before committing damage outside passive engagement range', () => {
    const initial = tacticsState({ x: 1, y: 5 });
    const aggressiveAction = { ...initial, enemyHp: 1, turns: 1, message: 'Disparo preventivo.' };

    const resolved = chroniclesTacticsResolvePlayerAction(initial, aggressiveAction, {
      forceCombat: true,
      forceEnemyIds: ['corrupted-pawn'],
      random: () => 0,
    });

    expect(resolved.phase).toBe('combat');
    expect(resolved.enemyHp).toBe(initial.enemyHp);
    expect(resolved.turns).toBe(initial.turns);
    expect(resolved.initiative?.order.map((actor) => actor.id)).toContain('corrupted-pawn');
  });

  it('allows exactly the current party actor to act and blocks enemy initiative turns', () => {
    const base = tacticsState();
    const partyTurn = {
      ...base,
      phase: 'combat',
      initiative: {
        version: 1,
        die: '1d8',
        round: 2,
        cursor: 0,
        order: [
          { id: 'rook', kind: 'party', name: 'Hildegard', agility: 3, roll: 5, initiative: 8 },
          { id: 'corrupted-pawn', kind: 'enemy', name: 'Peón', agility: 2, roll: 4, initiative: 6 },
        ],
      },
    };

    expect(chroniclesTacticsCurrentActor(partyTurn)?.id).toBe('rook');
    expect(chroniclesTacticsPartyCanAct(partyTurn)).toBe(true);
    expect(chroniclesTacticsPartyCanAct(partyTurn, 'rook')).toBe(true);
    expect(chroniclesTacticsPartyCanAct(partyTurn, 'matthias')).toBe(false);

    const enemyTurn = {
      ...partyTurn,
      initiative: { ...partyTurn.initiative, cursor: 1 },
    };
    expect(chroniclesTacticsCurrentActor(enemyTurn)?.kind).toBe('enemy');
    expect(chroniclesTacticsPartyCanAct(enemyTurn)).toBe(false);
    expect(chroniclesTacticsCombatActive(enemyTurn)).toBe(true);
  });
});
