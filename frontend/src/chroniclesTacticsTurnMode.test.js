import { describe, expect, it } from 'vitest';
import { chroniclesActiveEnemies, createChroniclesState } from './chroniclesOfMatthias.js';
import {
  chroniclesTacticsCombatActive,
  chroniclesTacticsCurrentActor,
  chroniclesTacticsPartyCanAct,
  chroniclesTacticsPrepareExplorationSpawn,
  chroniclesTacticsResolvePlayerAction,
} from './chroniclesTacticsTurnMode.js';
import { chroniclesRuntimeEnemyPosition } from './chroniclesOfMatthiasTurns.js';

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
    expect(resolved.initiative ?? null).toBeNull();
    expect(resolved.enemyTurnEvents).toEqual([]);
  });

  it('moves a fresh roaming encounter away from the deployment zone before exploration begins', () => {
    const initial = {
      ...createChroniclesState('gallery-of-forks'),
      round: 1,
      turnPhase: 'party',
      enemyPositions: {},
      enemyTurnEvents: [],
    };
    expect(chroniclesTacticsCombatActive(initial)).toBe(true);

    const prepared = chroniclesTacticsPrepareExplorationSpawn(initial);
    const stalker = chroniclesActiveEnemies(prepared).find((enemy) => enemy.id === 'fork-stalker');
    const position = chroniclesRuntimeEnemyPosition(prepared, stalker);
    const distance = Math.abs(position.x - prepared.x) + Math.abs(position.y - prepared.y);

    expect(position).not.toEqual({ x: 3, y: 5 });
    expect(distance).toBeGreaterThanOrEqual(5);
    expect(chroniclesTacticsCombatActive(prepared)).toBe(false);
  });

  it('freezes exploration and rolls initiative when movement enters combat range', () => {
    const initial = tacticsState();
    const engagedStep = { ...initial, x: 2, y: 5, turns: 1, message: 'Contacto.' };

    expect(chroniclesTacticsCombatActive(engagedStep)).toBe(true);
    const resolved = chroniclesTacticsResolvePlayerAction(initial, engagedStep, { random: () => 0 });

    expect(resolved.phase).toBe('combat');
    expect(resolved.initiative?.die).toBe('1d8');
    expect(resolved.initiative?.order.length).toBeGreaterThan(1);
    expect(Object.keys(resolved.partyPositions || {})).toHaveLength(4);
    expect(new Set(Object.values(resolved.partyPositions || {}).map((cell) => `${cell.x}:${cell.y}`)).size).toBe(4);
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

  it('puts every living enemy in the Tactics room on the initiative scheduler', () => {
    const initial = {
      ...createChroniclesState('menagerie-of-ash'),
      round: 1,
      turnPhase: 'party',
      enemyPositions: {},
      enemyTurnEvents: [],
    };
    const activeEnemyIds = chroniclesActiveEnemies(initial).map((enemy) => enemy.id).sort();

    expect(activeEnemyIds.length).toBeGreaterThan(1);
    expect(chroniclesTacticsCombatActive(initial)).toBe(true);

    const attemptedFreeMove = { ...initial, x: 2, y: 5, turns: 1, message: 'Movimiento libre indebido.' };
    const resolved = chroniclesTacticsResolvePlayerAction(initial, attemptedFreeMove, { random: () => 0 });
    const scheduledEnemyIds = (resolved.initiative?.order || [])
      .filter((actor) => actor.kind === 'enemy')
      .map((actor) => actor.id)
      .sort();

    expect(scheduledEnemyIds).toEqual(activeEnemyIds);
    expect({ x: resolved.x, y: resolved.y }).toEqual({ x: initial.x, y: initial.y });
  });

  it('advances exactly one initiative slot after a party action without resolving the enemy side', () => {
    const initial = tacticsState({
      phase: 'combat',
      initiative: {
        version: 1,
        die: '1d8',
        round: 1,
        cursor: 0,
        order: [
          { id: 'rook', kind: 'party', name: 'Hildegard', agility: 2, roll: 8, initiative: 10 },
          { id: 'corrupted-pawn', kind: 'enemy', name: 'Peón', agility: 0, roll: 7, initiative: 7 },
          { id: 'matthias', kind: 'party', name: 'Matthias', agility: 4, roll: 1, initiative: 5 },
        ],
      },
    });
    const acted = { ...initial, turns: initial.turns + 1, message: 'Hildegard actúa.' };

    const resolved = chroniclesTacticsResolvePlayerAction(initial, acted);

    expect(chroniclesTacticsCurrentActor(resolved)?.id).toBe('corrupted-pawn');
    expect(resolved.enemyTurnEvents).toEqual([]);
    expect(resolved.enemyHp).toBe(initial.enemyHp);
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
