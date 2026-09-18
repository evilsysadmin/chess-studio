import { describe, expect, it } from 'vitest';
import { createChroniclesState } from '../chroniclesOfMatthias.js';
import { chroniclesTacticsUse } from '../chroniclesOfMatthiasTactics.js';
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

describe('Chronicles Chain Basilica', () => {
  it('registers a seventh authored map with a three-link objective and optional wisp', () => {
    expect(chroniclesMapIds()).toContain('chain-basilica');
    const basilica = chroniclesMapById('chain-basilica');

    expect(basilica.version).toBe(1);
    expect(basilica.grid).toHaveLength(9);
    expect(basilica.grid[0]).toHaveLength(13);
    expect(basilica.enemies.map((enemy) => enemy.id)).toEqual([
      'iron-deacon',
      'chain-prelate',
      'choir-hound',
      'nave-spider',
      'censer-wisp',
    ]);
    expect(basilica.enemies.find((enemy) => enemy.id === 'censer-wisp')?.optional).toBe(true);
    expect(basilica.treasures.map((entry) => entry.id)).toEqual(['chain-altar', 'oculus-cache']);
  });

  it('stacks three liturgical links, consumes all three at the altar and keeps the wisp optional', () => {
    const basilica = chroniclesMapById('chain-basilica');
    let state = chroniclesMapTransitionState(createChroniclesState(), basilica.id);
    state = chroniclesTacticsUse(state, 'basilica-inscription');

    for (const enemyId of ['iron-deacon', 'choir-hound', 'nave-spider']) {
      const enemy = basilica.enemies.find((candidate) => candidate.id === enemyId);
      state = {
        ...chroniclesApplyContentEffects(state, enemy.onDefeat.effects),
        [enemy.hpKey]: 0,
      };
    }

    expect(chroniclesInventoryEntries(state)).toContainEqual(expect.objectContaining({
      id: 'liturgical-link',
      name: 'Eslabón Litúrgico',
      quantity: 3,
    }));

    state = {
      ...state,
      chainPrelateHp: 0,
      x: 9,
      y: 5,
    };
    state = chroniclesTacticsUse(state, 'chain-altar');

    expect(state.chainAltarOpened).toBe(true);
    expect(chroniclesInventoryEntries(state).map((item) => item.id)).not.toContain('liturgical-link');
    expect(chroniclesInventoryEntries(state)).toContainEqual(expect.objectContaining({
      id: 'bell-key',
      name: 'Llave de Campana',
      quantity: 1,
    }));
    expect(chroniclesQuestEntries(state).find((quest) => quest.id === 'silence-chain-basilica')).toMatchObject({
      status: 'active',
      objective: 'Lleva la Llave de Campana hasta la reja superior.',
    });

    state = { ...state, x: 10, y: 1 };
    const escaped = chroniclesTacticsUse(state, 'basilica-upper-gate');

    expect(escaped.phase).toBe('escaped');
    expect(escaped.censerWispHp).toBe(5);
    expect(chroniclesInventoryEntries(escaped).map((item) => item.id)).not.toContain('bell-key');
    expect(chroniclesQuestEntries(escaped).find((quest) => quest.id === 'silence-chain-basilica')).toMatchObject({
      status: 'completed',
      objective: 'Basílica superada.',
    });
    expect(escaped.journal.at(-1)?.id).toBe('chain-basilica-cleared');
  });

  it('turns the optional Archive glass drop into a Basilica reward without gating the main route', () => {
    let state = chroniclesMapTransitionState(createChroniclesState(), 'chain-basilica');
    state = chroniclesApplyContentEffects(state, [{
      type: 'grant-item',
      itemId: 'black-glass-drop',
      name: 'Gota de Vidrio Negro',
      description: 'Trofeo opcional del Archivo.',
      quantity: 1,
    }]);

    state = { ...state, x: 5, y: 1 };
    state = chroniclesTacticsUse(state, 'black-glass-oculus');
    expect(state.glassOculusAwake).toBe(true);
    expect(chroniclesInventoryEntries(state).map((item) => item.id)).not.toContain('black-glass-drop');

    state = { ...state, x: 7, y: 1 };
    state = chroniclesTacticsUse(state, 'oculus-cache');

    expect(state.oculusCacheOpened).toBe(true);
    expect(chroniclesInventoryEntries(state)).toContainEqual(expect.objectContaining({
      id: 'resonant-lamina',
      name: 'Lámina Resonante',
      quantity: 1,
    }));
    expect(state.chainAltarOpened).toBe(false);
  });
});
