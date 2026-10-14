import { describe, expect, it } from 'vitest';
import { createChroniclesState } from '../chroniclesOfMatthias.js';
import {
  chroniclesAdvanceCombatInitiative,
  chroniclesAdvanceInitiative,
  chroniclesCurrentInitiativeActor,
  chroniclesEnemyInitiativeAgility,
  chroniclesEngagedEnemies,
  chroniclesEnemyVisibleToParty,
  chroniclesReconcileFirstPersonCombat,
  chroniclesPartyInitiativeAgility,
  chroniclesRollInitiative,
  chroniclesStartInitiativeCombat,
} from './chroniclesInitiative.js';

function sequence(values) {
  let index = 0;
  return () => values[index++] ?? 0;
}

describe('Chronicles initiative', () => {
  it('rolls AGI + 1d8 for every living combatant and sorts highest first', () => {
    const state = {
      party: [
        { id: 'fast', name: 'Fast', hp: 4, agility: 5 },
        { id: 'slow', name: 'Slow', hp: 4, agility: 2 },
        { id: 'down', name: 'Down', hp: 0, agility: 99 },
      ],
      enemyHp: 5,
      rpgModifiers: {},
    };
    const enemies = [{
      id: 'enemy',
      name: 'Enemy',
      hpKey: 'enemyHp',
      maxHp: 5,
      retaliation: 1,
      ai: { movement: 'hold' },
    }];

    const initiative = chroniclesRollInitiative(state, enemies, {
      random: sequence([0, 0.999, 0.5]),
    });

    expect(initiative.die).toBe('1d8');
    expect(initiative.order.map((actor) => [actor.id, actor.agility, actor.roll, actor.initiative])).toEqual([
      ['slow', 2, 8, 10],
      ['fast', 5, 1, 6],
      ['enemy', 1, 5, 6],
    ]);
  });

  it('keeps low-level order chaotic enough for a slower actor to beat a faster one', () => {
    const state = {
      party: [
        { id: 'agi-4', hp: 1, agility: 4 },
        { id: 'agi-6', hp: 1, agility: 6 },
      ],
      rpgModifiers: {},
    };
    const initiative = chroniclesRollInitiative(state, [], {
      random: sequence([0.999, 0]),
    });
    expect(initiative.order.map((actor) => actor.id)).toEqual(['agi-4', 'agi-6']);
    expect(initiative.order[0].initiative).toBe(12);
    expect(initiative.order[1].initiative).toBe(7);
  });

  it('adds progression AGI exactly once to the resolved party stat and advances by rounds', () => {
    const state = {
      party: [{ id: 'matthias', hp: 7, agility: 4 }],
      rpgModifiers: { matthias: { initiativeBonus: 3 } },
    };
    expect(chroniclesPartyInitiativeAgility(state, state.party[0])).toBe(7);
    // A stray caller-provided bonus must not stack the same AGI again.
    expect(chroniclesPartyInitiativeAgility(state, state.party[0], 3)).toBe(7);

    const initiative = chroniclesRollInitiative(state, [], {
      random: () => 0,
      partyAgilityBonuses: { matthias: 3 },
    });
    expect(chroniclesCurrentInitiativeActor(initiative)?.id).toBe('matthias');
    expect(initiative.order[0].agility).toBe(7);
    const next = chroniclesAdvanceInitiative(initiative);
    expect(next.cursor).toBe(0);
    expect(next.round).toBe(2);
  });

  it('enters combat only for engaged or explicitly attacked enemies and keeps the rolled order', () => {
    const state = {
      phase: 'explore',
      x: 2,
      y: 2,
      party: [{ id: 'matthias', name: 'Matthias', hp: 7, agility: 4 }],
      rpgModifiers: {},
      nearHp: 3,
      farHp: 3,
    };
    const enemies = [
      {
        id: 'near',
        name: 'Near',
        hpKey: 'nearHp',
        x: 2,
        y: 3,
        maxHp: 3,
        retaliation: 1,
        ai: { movement: 'hold', engageRange: 1 },
      },
      {
        id: 'far',
        name: 'Far',
        hpKey: 'farHp',
        x: 2,
        y: 6,
        maxHp: 3,
        retaliation: 1,
        ai: { movement: 'hold', engageRange: 1 },
      },
    ];

    const engaged = chroniclesStartInitiativeCombat(state, enemies, {
      random: sequence([0, 0]),
    });
    expect(engaged.phase).toBe('combat');
    expect(engaged.initiative.order.map((actor) => actor.id).sort()).toEqual(['matthias', 'near']);

    const forced = chroniclesStartInitiativeCombat(
      { ...state, y: 1 },
      enemies,
      { forceEnemyIds: ['far'], random: sequence([0, 0]) },
    );
    expect(forced.phase).toBe('combat');
    expect(forced.initiative.order.map((actor) => actor.id).sort()).toEqual(['far', 'matthias']);
  });

  it('does not start a first-person fight through a nearby solid wall', () => {
    const state = {
      ...createChroniclesState('crypt-eight-squares', null, { rules: 'mm3' }),
      x: 1,
      y: 4,
      hiddenHp: 3,
    };
    // (2,4) is a wall. The alternate route needs four steps, not two.
    const behindWall = {
      id: 'hidden', hpKey: 'hiddenHp', maxHp: 3, x: 3, y: 4,
      ai: { movement: 'hold', engageRange: 2 },
    };
    expect(chroniclesEngagedEnemies(state, [behindWall])).toEqual([]);
    expect(chroniclesStartInitiativeCombat(state, [behindWall])).toBe(state);

    const inCorridor = { ...behindWall, x: 1, y: 3 };
    expect(chroniclesEngagedEnemies(state, [inCorridor]).map((foe) => foe.id)).toEqual(['hidden']);
  });

  it('only begins first-person combat when a foe is actually in view or can strike', () => {
    const state = {
      ...createChroniclesState('crypt-eight-squares', null, { rules: 'mm3' }),
      x: 1, y: 4, direction: 2, hiddenHp: 3,
    };
    const distant = {
      id: 'hidden', hpKey: 'hiddenHp', maxHp: 3,
      x: 1, y: 1,
      ai: { movement: 'hold', engageRange: 6, attackReach: 1 },
    };
    // Close enough to aggro by the old radius, but behind the camera and
    // too far to attack: exploration continues.
    expect(chroniclesEngagedEnemies(state, [distant])).toEqual([]);
    expect(chroniclesStartInitiativeCombat(state, [distant])).toBe(state);

    // Turning to face a foe with clear sightline triggers initiative.
    const lookingNorth = { ...state, direction: 0 };
    expect(chroniclesEnemyVisibleToParty(lookingNorth, distant)).toBe(true);
    expect(chroniclesStartInitiativeCombat(lookingNorth, [distant]).initiative?.order
      .some((actor) => actor.id === 'hidden')).toBe(true);

    // A genuine ranged attacker may trigger combat even behind the camera.
    const shooter = {
      ...distant, x: 1, y: 2,
      ai: { movement: 'hold', engageRange: 6, attackReach: 3, requiresLineOfSight: true },
    };
    expect(chroniclesEnemyVisibleToParty(state, shooter)).toBe(false);
    expect(chroniclesEngagedEnemies(state, [shooter]).map((enemy) => enemy.id)).toEqual(['hidden']);
  });

  it('uses the actual first-person camera width rather than a 360-degree alert radius', () => {
    const state = {
      ...createChroniclesState('crypt-eight-squares', null, { rules: 'mm3' }),
      x: 1, y: 4, direction: 0, flankHp: 4,
    };
    const flank = {
      id: 'flank', hpKey: 'flankHp', maxHp: 4,
      x: 2, y: 3,
      ai: { movement: 'hold', engageRange: 6, attackReach: 1 },
    };
    expect(chroniclesEnemyVisibleToParty(state, flank, { viewAspect: 0.5 })).toBe(false);
    expect(chroniclesEnemyVisibleToParty(state, flank, { viewAspect: 2 })).toBe(true);
  });

  it('releases a stale first-person combat after an enemy disappears behind a wall', () => {
    const state = {
      ...createChroniclesState('crypt-eight-squares', null, { rules: 'mm3' }),
      x: 1, y: 4, direction: 0, foeHp: 3,
    };
    const foe = {
      id: 'foe', name: 'Foe', hpKey: 'foeHp', maxHp: 3,
      x: 1, y: 1, ai: { movement: 'hold', engageRange: 6, attackReach: 1 },
    };
    const fighting = chroniclesStartInitiativeCombat(state, [foe], { random: () => 0 });
    expect(fighting.phase).toBe('combat');
    expect(chroniclesReconcileFirstPersonCombat(fighting, [foe])).toBe(fighting);

    const lostContact = { ...fighting, enemyPositions: { foe: { x: 3, y: 4 } } };
    const resumed = chroniclesReconcileFirstPersonCombat(lostContact, [foe]);
    expect(resumed).toMatchObject({ phase: 'explore', initiative: null, partyPositions: {} });
    expect(resumed.x).toBe(1);
    expect(resumed.y).toBe(4);
    expect(resumed.foeHp).toBe(3);

    // Tactical encounters preserve their own independent lifecycle.
    expect(chroniclesReconcileFirstPersonCombat({ ...lostContact, combatRules: null }, [foe]))
      .toEqual({ ...lostContact, combatRules: null });
  });

  it('continues after a fallen current actor instead of restarting the round', () => {
    const state = {
      phase: 'combat',
      party: [
        { id: 'a', hp: 4, agility: 4 },
        { id: 'b', hp: 0, agility: 3 },
      ],
      enemyHp: 4,
      initiative: {
        version: 1,
        die: '1d8',
        round: 3,
        cursor: 1,
        order: [
          { id: 'a', kind: 'party', name: 'A', agility: 4, roll: 4, initiative: 8 },
          { id: 'b', kind: 'party', name: 'B', agility: 3, roll: 4, initiative: 7 },
          { id: 'enemy', kind: 'enemy', name: 'Enemy', agility: 2, roll: 4, initiative: 6 },
        ],
      },
    };
    const next = chroniclesAdvanceCombatInitiative(state, [{ id: 'enemy', hpKey: 'enemyHp' }]);
    expect(next.initiative.order.map((actor) => actor.id)).toEqual(['a', 'enemy']);
    expect(chroniclesCurrentInitiativeActor(next.initiative)?.id).toBe('enemy');
    expect(next.initiative.round).toBe(3);
  });

  it('drops defeated actors and returns to exploration when combat has no enemies left', () => {
    const state = {
      phase: 'combat',
      party: [{ id: 'matthias', hp: 7, agility: 4 }],
      enemyHp: 0,
      initiative: {
        version: 1,
        die: '1d8',
        round: 1,
        cursor: 0,
        order: [
          { id: 'matthias', kind: 'party', name: 'Matthias', agility: 4, roll: 4, initiative: 8 },
          { id: 'enemy', kind: 'enemy', name: 'Enemy', agility: 2, roll: 3, initiative: 5 },
        ],
      },
    };
    const next = chroniclesAdvanceCombatInitiative(state, [{ id: 'enemy', hpKey: 'enemyHp' }]);
    expect(next.phase).toBe('explore');
    expect(next.turnPhase).toBe('party');
    expect(next.initiative).toBeNull();
  });

  it('finishes combat without teleporting the exploration anchor to a hero tactical tile', () => {
    const state = {
      phase: 'combat',
      x: 1,
      y: 5,
      party: [{ id: 'matthias', hp: 4, agility: 4 }],
      partyPositions: { matthias: { x: 2, y: 4 } },
      enemyHp: 0,
      initiative: {
        version: 1,
        die: '1d8',
        round: 2,
        cursor: 0,
        order: [
          { id: 'matthias', kind: 'party', initiative: 8 },
          { id: 'enemy', kind: 'enemy', initiative: 5 },
        ],
      },
    };
    const next = chroniclesAdvanceCombatInitiative(state, [{ id: 'enemy', hpKey: 'enemyHp' }]);
    expect(next).toMatchObject({ x: 1, y: 5, phase: 'explore', partyPositions: {} });
    expect(next.initiative).toBeNull();
  });

  it('preserves enemy turns after a living party member and rolls into the next round', () => {
    const state = {
      phase: 'combat',
      party: [{ id: 'matthias', hp: 5 }],
      enemyHp: 4,
      initiative: {
        version: 1,
        die: '1d8',
        round: 2,
        cursor: 0,
        order: [
          { id: 'matthias', kind: 'party', initiative: 9 },
          { id: 'enemy', kind: 'enemy', initiative: 7 },
        ],
      },
    };
    const enemies = [{ id: 'enemy', hpKey: 'enemyHp' }];
    const enemyTurn = chroniclesAdvanceCombatInitiative(state, enemies);
    expect(chroniclesCurrentInitiativeActor(enemyTurn.initiative)?.id).toBe('enemy');
    expect(enemyTurn.initiative.round).toBe(2);
    const partyTurn = chroniclesAdvanceCombatInitiative(enemyTurn, enemies);
    expect(chroniclesCurrentInitiativeActor(partyTurn.initiative)?.id).toBe('matthias');
    expect(partyTurn.initiative.round).toBe(3);
  });

  it('skips a defeated enemy without forfeiting the next living enemy turn', () => {
    const state = {
      phase: 'combat',
      party: [{ id: 'matthias', hp: 5 }],
      defeatedHp: 0,
      survivingHp: 3,
      initiative: {
        version: 1,
        die: '1d8',
        round: 4,
        cursor: 0,
        order: [
          { id: 'matthias', kind: 'party', initiative: 9 },
          { id: 'defeated', kind: 'enemy', initiative: 8 },
          { id: 'surviving', kind: 'enemy', initiative: 7 },
        ],
      },
    };
    const next = chroniclesAdvanceCombatInitiative(state, [
      { id: 'defeated', hpKey: 'defeatedHp' },
      { id: 'surviving', hpKey: 'survivingHp' },
    ]);
    expect(next.phase).toBe('combat');
    expect(next.initiative.order.map((actor) => actor.id)).toEqual(['matthias', 'surviving']);
    expect(chroniclesCurrentInitiativeActor(next.initiative)?.id).toBe('surviving');
    expect(next.initiative.round).toBe(4);
  });

  it('treats nullable legacy agility as missing rather than overriding the enemy build with zero', () => {
    const enemy = {
      id: 'horse-thing',
      maxHp: 3,
      retaliation: 1,
      ai: { movement: 'knight-chase' },
    };
    expect(chroniclesEnemyInitiativeAgility({ ...enemy, agility: null })).toBe(4);
    expect(chroniclesEnemyInitiativeAgility({ ...enemy, agility: '' })).toBe(4);
    expect(chroniclesEnemyInitiativeAgility({ ...enemy, agility: 0 })).toBe(0);
  });

  it('derives legacy enemy AGI from movement when no authored AGI exists', () => {
    expect(chroniclesEnemyInitiativeAgility({
      id: 'horse-thing',
      maxHp: 3,
      retaliation: 1,
      ai: { movement: 'knight-chase' },
    })).toBe(4);
  });
});
