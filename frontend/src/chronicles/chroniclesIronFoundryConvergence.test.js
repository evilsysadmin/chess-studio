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
  chroniclesMapTransitionState,
} from './chroniclesMapCatalog.js';

function hp(state) {
  return state.party.map((member) => member.hp);
}

describe('Chronicles Black Iron Foundry convergence', () => {
  it('authors a larger main-route encounter with four required guardians, an optional scavenger and real traps', () => {
    const map = chroniclesMapById('iron-foundry');
    expect(map.version).toBe(1);
    expect(map.grid).toHaveLength(9);
    expect(map.grid[0]).toHaveLength(11);
    expect(map.enemies.map((enemy) => enemy.id)).toEqual([
      'iron-sentinel',
      'chain-hound',
      'slag-crawler',
      'ember-artificer',
      'scrap-goblin',
    ]);
    expect(map.enemies.find((enemy) => enemy.id === 'scrap-goblin')?.optional).toBe(true);
    expect(map.traps.map((trap) => trap.id)).toEqual(['slag-vent-west', 'chain-plate-east']);
    expect(map.treasures.map((treasure) => treasure.id)).toEqual(['foreman-coffer', 'maintenance-locker']);
  });

  it('makes the normal route pay for stepping on active Foundry machinery', () => {
    const foundry = chroniclesMapTransitionState(createChroniclesState(), 'iron-foundry');
    const before = {
      ...foundry,
      x: 5,
      y: 7,
    };
    const beforeHp = hp(before);

    const trapped = chroniclesTacticsMove(before, { x: 5, y: 6 });

    expect(trapped.slagVentWestSpent).toBe(true);
    expect(hp(trapped)).toEqual(beforeHp.map((value) => (value > 0 ? Math.max(0, value - 1) : value)));
    expect(trapped.message).toMatch(/escoria ardiente/i);
  });

  it('lets the secret-route Obsidian Idol neutralize Foundry traps without consuming the relic', () => {
    let foundry = chroniclesMapTransitionState(createChroniclesState(), 'iron-foundry');
    foundry = chroniclesApplyContentEffects(foundry, [{
      type: 'grant-item',
      itemId: 'obsidian-idol',
      name: 'Ídolo de Obsidiana',
      description: 'Prueba de recompensa de la ruta secreta.',
      quantity: 1,
    }]);
    foundry = { ...foundry, x: 3, y: 1 };

    foundry = chroniclesTacticsUse(foundry, 'obsidian-socket');
    expect(foundry.foundrySafeguard).toBe(true);
    expect(chroniclesInventoryEntries(foundry)).toContainEqual(expect.objectContaining({
      id: 'obsidian-idol',
      quantity: 1,
    }));

    foundry = { ...foundry, x: 5, y: 7 };
    const beforeHp = hp(foundry);
    const crossed = chroniclesTacticsMove(foundry, { x: 5, y: 6 });

    expect(crossed.slagVentWestSpent).toBe(false);
    expect(hp(crossed)).toEqual(beforeHp);
  });

  it('lets the four required guardians unlock the foreman route while the optional scrap goblin survives', () => {
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
    const escaped = chroniclesTacticsUse(state, 'foundry-gate');

    expect(escaped.phase).toBe('escaped');
    expect(chroniclesInventoryEntries(escaped).map((item) => item.id)).not.toContain('forgemaster-seal');
    expect(chroniclesQuestEntries(escaped).find((quest) => quest.id === 'break-black-foundry')).toMatchObject({
      status: 'completed',
      objective: 'Fundición superada.',
    });
    expect(escaped.scrapGoblinHp).toBe(5);
    expect(escaped.journal.at(-1)?.id).toBe('iron-foundry-cleared');
  });
});
