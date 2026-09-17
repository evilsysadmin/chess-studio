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

describe('Chronicles secret Ash Vault route', () => {
  it('discovers a hidden door, consumes its key and enters a distinct side map', () => {
    expect(chroniclesMapIds()).toContain('ash-vault');
    const vault = chroniclesMapById('ash-vault');
    expect(vault.version).toBe(2);
    expect(vault.grid).toHaveLength(7);
    expect(vault.grid[0]).toHaveLength(9);
    expect(vault.enemies.map((enemy) => enemy.id)).toEqual([
      'cinder-warden',
      'soot-mimic',
      'vault-spider',
      'vault-wisp',
    ]);
    expect(vault.enemies.find((enemy) => enemy.id === 'vault-wisp')?.optional).toBe(true);

    let state = chroniclesMapTransitionState(createChroniclesState(), 'menagerie-of-ash');
    state = chroniclesApplyContentEffects(state, [
      { type: 'set', key: 'emberCacheOpened', value: true },
      {
        type: 'grant-item',
        itemId: 'cinder-key',
        name: 'Llave de Escoria',
        description: 'Llave de prueba para la ruta secreta.',
        quantity: 1,
      },
    ]);
    state = { ...state, x: 1, y: 3 };

    expect(chroniclesTacticsInteractions(state)).toContainEqual(expect.objectContaining({
      id: 'ash-wall-seam',
      label: 'Examinar junta ennegrecida',
    }));
    expect(chroniclesTacticsInteractions(state).map((entry) => entry.id)).not.toContain('ash-secret-door');

    state = chroniclesTacticsUse(state, 'ash-wall-seam');
    expect(state.ashDoorFound).toBe(true);
    expect(chroniclesQuestEntries(state).find((quest) => quest.id === 'behind-the-ash-wall')).toMatchObject({
      status: 'active',
      objective: 'Abre la puerta oculta de la Menagerie.',
    });
    expect(chroniclesTacticsInteractions(state)).toContainEqual(expect.objectContaining({
      id: 'ash-secret-door',
      label: 'Abrir puerta oculta',
    }));

    const entered = chroniclesTacticsUse(state, 'ash-secret-door');
    expect(entered.mapId).toBe('ash-vault');
    expect({ x: entered.x, y: entered.y }).toEqual({ x: 1, y: 5 });
    expect(chroniclesInventoryEntries(entered).map((item) => item.id)).not.toContain('cinder-key');
    expect(entered.cinderWardenHp).toBe(9);
    expect(entered.sootMimicHp).toBe(6);
    expect(entered.vaultSpiderHp).toBe(5);
    expect(entered.vaultWispHp).toBe(5);
    expect(chroniclesQuestEntries(entered).find((quest) => quest.id === 'behind-the-ash-wall')).toMatchObject({
      status: 'active',
      objective: 'Saquea la Cámara de Ceniza y encuentra una salida.',
    });
  });

  it('rewards the required encounter, lets the optional wisp survive and rejoins Foundry with the idol', () => {
    let state = chroniclesMapTransitionState(createChroniclesState(), 'ash-vault');
    state = chroniclesApplyContentEffects(state, [{
      type: 'start-quest',
      questId: 'behind-the-ash-wall',
      title: 'Tras el muro de ceniza',
      description: 'Prueba de ruta lateral.',
      objective: 'Saquea la Cámara de Ceniza y encuentra una salida.',
      order: 40,
    }]);
    state = {
      ...state,
      cinderWardenHp: 0,
      sootMimicHp: 0,
      vaultSpiderHp: 0,
      vaultWispHp: 5,
      x: 7,
      y: 3,
    };

    expect(chroniclesTacticsInteractions(state)).toContainEqual(expect.objectContaining({
      id: 'ash-reliquary',
      label: 'Abrir relicario de ceniza',
    }));
    state = chroniclesTacticsUse(state, 'ash-reliquary');
    expect(state.vaultReliquaryOpened).toBe(true);
    expect(chroniclesInventoryEntries(state)).toContainEqual(expect.objectContaining({
      id: 'obsidian-idol',
      name: 'Ídolo de Obsidiana',
      quantity: 1,
    }));
    expect(chroniclesQuestEntries(state).find((quest) => quest.id === 'behind-the-ash-wall')).toMatchObject({
      status: 'completed',
      objective: 'Relicario recuperado.',
    });

    state = { ...state, x: 6, y: 1 };
    const foundry = chroniclesTacticsUse(state, 'ash-vault-exit');
    expect(foundry.mapId).toBe('iron-foundry');
    expect(foundry.phase).toBe('explore');
    expect({ x: foundry.x, y: foundry.y }).toEqual({ x: 1, y: 1 });
    expect(foundry.vaultWispHp).toBe(0);
    expect(chroniclesInventoryEntries(foundry)).toContainEqual(expect.objectContaining({
      id: 'obsidian-idol',
      quantity: 1,
    }));
    expect(foundry.ironSentinelHp).toBe(10);
    expect(foundry.chainHoundHp).toBe(7);
    expect(foundry.journal.at(-1)?.id).toBe('ash-vault-cleared');
  });

  it('gives the optional vault light its own non-required trophy loot', () => {
    const vault = chroniclesMapById('ash-vault');
    const wisp = vault.enemies.find((enemy) => enemy.id === 'vault-wisp');
    const rewarded = chroniclesApplyContentEffects({}, wisp.onDefeat.effects);

    expect(chroniclesInventoryEntries(rewarded)).toContainEqual(expect.objectContaining({
      id: 'luminous-ash',
      name: 'Ceniza Luminosa',
      quantity: 1,
    }));
    expect(vault.exits[0].requirements.map((requirement) => requirement.key)).not.toContain('vaultWispHp');
  });
});