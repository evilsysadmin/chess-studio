import { describe, expect, it } from 'vitest';
import { createChroniclesState } from '../chroniclesOfMatthias.js';
import {
  chroniclesTacticsInteractions,
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

describe('Chronicles Echo Cistern', () => {
  it('registers a tenth authored map with two sluices and optional side encounters', () => {
    expect(chroniclesMapIds()).toContain('echo-cistern');
    const cistern = chroniclesMapById('echo-cistern');

    expect(cistern.version).toBe(1);
    expect(cistern.grid).toHaveLength(10);
    expect(cistern.grid[0]).toHaveLength(13);
    expect(cistern.enemies.map((enemy) => enemy.id)).toEqual([
      'cistern-warden',
      'west-silt-hound',
      'east-drain-spider',
      'echo-bishop',
      'brine-wisp',
    ]);
    expect(cistern.enemies.filter((enemy) => enemy.optional).map((enemy) => enemy.id)).toEqual([
      'echo-bishop',
      'brine-wisp',
    ]);
    expect(cistern.interactables.filter((entry) => entry.kind === 'lever').map((entry) => entry.id)).toEqual([
      'west-sluice-wheel',
      'east-sluice-wheel',
    ]);
  });

  it('supports the normal combat route through both sluices and keeps optional enemies optional', () => {
    let state = chroniclesMapTransitionState(createChroniclesState(), 'echo-cistern');
    state = chroniclesTacticsUse(state, 'cistern-inscription');

    state = {
      ...state,
      westSiltHoundHp: 0,
      x: 3,
      y: 5,
    };
    state = chroniclesTacticsUse(state, 'west-sluice-wheel');
    expect(state.westSluiceSet).toBe(true);
    expect(state.eastSluiceSet).toBe(false);

    state = {
      ...state,
      eastDrainSpiderHp: 0,
      x: 9,
      y: 5,
    };
    state = chroniclesTacticsUse(state, 'east-sluice-wheel');
    expect(state.eastSluiceSet).toBe(true);

    state = {
      ...state,
      cisternWardenHp: 0,
      x: 6,
      y: 8,
    };
    expect(chroniclesTacticsInteractions(state)).toContainEqual(expect.objectContaining({
      id: 'echo-drain-seal',
      label: 'Recuperar Sello del Desagüe',
    }));
    state = chroniclesTacticsUse(state, 'echo-drain-seal');

    expect(state.echoSealClaimed).toBe(true);
    expect(chroniclesInventoryEntries(state)).toContainEqual(expect.objectContaining({
      id: 'echo-drain-seal',
      name: 'Sello del Desagüe',
      quantity: 1,
    }));
    expect(chroniclesQuestEntries(state).find((quest) => quest.id === 'drain-echo-cistern')).toMatchObject({
      status: 'active',
      objective: 'Lleva el Sello del Desagüe hasta la salida superior.',
    });

    state = { ...state, x: 10, y: 1 };
    const escaped = chroniclesTacticsUse(state, 'cistern-upper-gate');

    expect(escaped.phase).toBe('escaped');
    expect(escaped.echoBishopHp).toBe(8);
    expect(escaped.brineWispHp).toBe(5);
    expect(chroniclesInventoryEntries(escaped).map((item) => item.id)).not.toContain('echo-drain-seal');
    expect(chroniclesQuestEntries(escaped).find((quest) => quest.id === 'drain-echo-cistern')).toMatchObject({
      status: 'completed',
      objective: 'Cisterna superada.',
    });
    expect(escaped.journal.at(-1)?.id).toBe('echo-cistern-cleared');
  });

  it('lets Bellwright Oil solve the west sluice without killing its guardian', () => {
    let state = chroniclesMapTransitionState(createChroniclesState(), 'echo-cistern');
    state = chroniclesApplyContentEffects(state, [
      {
        type: 'grant-item',
        itemId: 'bellwright-oil',
        name: 'Aceite de Campanero',
        description: 'Herramienta opcional heredada de la Torre.',
        quantity: 1,
      },
      {
        type: 'start-quest',
        questId: 'drain-echo-cistern',
        title: 'Drenar la Cisterna',
        description: 'Prueba de compuertas.',
        objective: 'Activa ambas compuertas y derrota al Custodio de la Cisterna.',
        order: 90,
      },
    ]);
    state = { ...state, x: 3, y: 5 };

    expect(chroniclesTacticsInteractions(state)).toContainEqual(expect.objectContaining({
      id: 'west-sluice-oil',
      label: 'Lubricar compuerta oeste',
    }));
    state = chroniclesTacticsUse(state, 'west-sluice-oil');

    expect(state.westSluiceSet).toBe(true);
    expect(state.westSiltHoundHp).toBe(7);
    expect(chroniclesInventoryEntries(state).map((item) => item.id)).not.toContain('bellwright-oil');
    expect(chroniclesQuestEntries(state).find((quest) => quest.id === 'drain-echo-cistern')).toMatchObject({
      status: 'active',
      objective: 'Activa la compuerta restante y derrota al Custodio de la Cisterna.',
    });
  });

  it('uses the Black Glass Prism to reveal optional loot without consuming the prism', () => {
    let state = chroniclesMapTransitionState(createChroniclesState(), 'echo-cistern');
    state = chroniclesApplyContentEffects(state, [{
      type: 'grant-item',
      itemId: 'black-glass-prism',
      name: 'Prisma de Vidrio Negro',
      description: 'Recompensa opcional de la Capilla.',
      quantity: 1,
    }]);
    state = { ...state, x: 7, y: 6 };

    state = chroniclesTacticsUse(state, 'prism-sounding');
    expect(state.prismCacheRevealed).toBe(true);
    expect(chroniclesInventoryEntries(state)).toContainEqual(expect.objectContaining({
      id: 'black-glass-prism',
      quantity: 1,
    }));

    state = { ...state, x: 9, y: 6 };
    state = chroniclesTacticsUse(state, 'drowned-prism-cache');

    expect(state.prismCacheOpened).toBe(true);
    expect(chroniclesInventoryEntries(state)).toContainEqual(expect.objectContaining({
      id: 'echo-lens',
      name: 'Lente de Eco',
      quantity: 1,
    }));
    expect(state.westSluiceSet).toBe(false);
    expect(state.eastSluiceSet).toBe(false);
  });
});
