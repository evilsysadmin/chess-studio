import { describe, expect, it } from 'vitest';
import { createChroniclesState } from '../chroniclesOfMatthias.js';
import {
  chroniclesTacticsMove,
  chroniclesTacticsUse,
} from '../chroniclesOfMatthiasTactics.js';
import {
  chroniclesApplyContentEffects,
  chroniclesInventoryEntries,
  chroniclesQuestEntries,
} from './chroniclesContentRuntime.js';
import {
  chroniclesMapById,
  chroniclesMapIds,
  chroniclesMapTransitionState,
} from './chroniclesMapCatalog.js';

function partyHp(state) {
  return state.party.map((member) => member.hp);
}

describe('Chronicles Black Iron Foundry', () => {
  it('registers a sixth authored map with required guardians, optional loot and two traps', () => {
    expect(chroniclesMapIds()).toContain('iron-foundry');
    const foundry = chroniclesMapById('iron-foundry');

    expect(foundry.version).toBe(2);
    expect(foundry.grid).toHaveLength(9);
    expect(foundry.grid[0]).toHaveLength(11);
    expect(foundry.enemies.map((enemy) => enemy.id)).toEqual([
      'iron-sentinel',
      'chain-hound',
      'slag-crawler',
      'ember-artificer',
      'scrap-goblin',
    ]);
    expect(foundry.enemies.find((enemy) => enemy.id === 'scrap-goblin')?.optional).toBe(true);
    expect(foundry.traps.map((trap) => trap.id)).toEqual(['slag-vent-west', 'chain-plate-east']);
    expect(foundry.treasures.map((treasure) => treasure.id)).toEqual(['foreman-coffer', 'maintenance-locker']);
  });

  it('makes the normal route pay for stepping on active machinery', () => {
    const foundry = chroniclesMapTransitionState(createChroniclesState(), 'iron-foundry');
    const before = { ...foundry, x: 5, y: 7 };
    const hpBefore = partyHp(before);

    const trapped = chroniclesTacticsMove(before, { x: 5, y: 6 });

    expect(trapped.slagVentWestSpent).toBe(true);
    expect(partyHp(trapped)).toEqual(hpBefore.map((hp) => (hp > 0 ? Math.max(0, hp - 1) : hp)));
    expect(trapped.message).toMatch(/escoria ardiente/i);
  });

  it('turns the secret-route Royal Cipher into a tangible Foundry advantage', () => {
    let state = chroniclesMapTransitionState(createChroniclesState(), 'iron-foundry');
    state = chroniclesApplyContentEffects(state, [{
      type: 'grant-item',
      itemId: 'royal-cipher',
      name: 'Cifra Real',
      description: 'Recompensa encadenada de Cámara y Archivo.',
      quantity: 1,
    }]);
    state = { ...state, x: 3, y: 1 };

    state = chroniclesTacticsUse(state, 'royal-cipher-console');
    expect(state.foundrySafeguard).toBe(true);
    expect(chroniclesInventoryEntries(state).map((item) => item.id)).not.toContain('royal-cipher');

    state = { ...state, x: 5, y: 7 };
    const hpBefore = partyHp(state);
    const crossed = chroniclesTacticsMove(state, { x: 5, y: 6 });

    expect(crossed.slagVentWestSpent).toBe(false);
    expect(partyHp(crossed)).toEqual(hpBefore);
  });

  it('opens the foreman route after four required guardians while the optional scavenger survives', () => {
    let state = chroniclesMapTransitionState(createChroniclesState(), 'iron-foundry');
    state = chroniclesTacticsUse(state, 'foundry-orders');
    state = {
      ...state,
      x: 7,
      y: 3,
      ironSentinelHp: 0,
      chainHoundHp: 0,
      slagCrawlerHp: 0,
      emberArtificerHp: 0,
      scrapGoblinHp: 5,
    };

    state = chroniclesTacticsUse(state, 'foreman-coffer');
    expect(chroniclesInventoryEntries(state)).toContainEqual(expect.objectContaining({
      id: 'forgemaster-seal',
      name: 'Sello del Maestro de Forja',
      quantity: 1,
    }));
    expect(state.scrapGoblinHp).toBe(5);
    expect(chroniclesQuestEntries(state).find((quest) => quest.id === 'break-black-foundry')).toMatchObject({
      status: 'active',
      objective: 'Lleva el Sello del Maestro de Forja hasta el portón.',
    });

    state = { ...state, x: 8, y: 1 };
    const basilica = chroniclesTacticsUse(state, 'foundry-gate');

    expect(basilica.mapId).toBe('chain-basilica');
    expect(basilica.phase).toBe('explore');
    expect({ x: basilica.x, y: basilica.y, direction: basilica.direction }).toEqual({ x: 1, y: 1, direction: 1 });
    expect(chroniclesInventoryEntries(basilica).map((item) => item.id)).not.toContain('forgemaster-seal');
    expect(chroniclesQuestEntries(basilica).find((quest) => quest.id === 'break-black-foundry')).toMatchObject({
      status: 'completed',
      objective: 'Fundición superada.',
    });
    expect(basilica.scrapGoblinHp).toBe(0);
    expect(basilica.ironDeaconHp).toBe(10);
    expect(basilica.chainPrelateHp).toBe(9);
    expect(basilica.choirHoundHp).toBe(7);
    expect(basilica.naveSpiderHp).toBe(6);
    expect(basilica.censerWispHp).toBe(5);
    expect(basilica.journal.at(-1)?.id).toBe('iron-foundry-cleared');
  });
});
