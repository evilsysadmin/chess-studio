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

describe('Chronicles Black Glass Chapel', () => {
  it('registers a connected secret map with three required guardians and an optional wisp', () => {
    expect(chroniclesMapIds()).toContain('black-glass-chapel');
    const chapel = chroniclesMapById('black-glass-chapel');

    expect(chapel.version).toBe(1);
    expect(chapel.grid).toHaveLength(7);
    expect(chapel.grid[0]).toHaveLength(9);
    expect(chapel.enemies.map((enemy) => enemy.id)).toEqual([
      'glass-deacon',
      'obsidian-spider',
      'reflection-hound',
      'mirror-wisp',
    ]);
    expect(chapel.enemies.find((enemy) => enemy.id === 'mirror-wisp')?.optional).toBe(true);
    expect(chapel.exits[0].requirements.map((requirement) => requirement.key)).not.toContain('mirrorWispHp');
  });

  it('discovers the Basilica seam without starting a side quest until the player actually enters', () => {
    let state = chroniclesMapTransitionState(createChroniclesState(), 'chain-basilica');
    state = chroniclesApplyContentEffects(state, [
      {
        type: 'grant-item',
        itemId: 'resonant-lamina',
        name: 'Lámina Resonante',
        description: 'Prueba de ruta secreta.',
        quantity: 1,
      },
      {
        type: 'grant-item',
        itemId: 'bell-key',
        name: 'Llave de Campana',
        description: 'Prueba de salida.',
        quantity: 1,
      },
      {
        type: 'start-quest',
        questId: 'silence-chain-basilica',
        title: 'Silenciar la Basílica',
        description: 'Prueba del objetivo principal.',
        objective: 'Lleva la Llave de Campana hasta la reja superior.',
        order: 70,
      },
    ]);
    state = { ...state, x: 7, y: 1 };

    expect(chroniclesTacticsInteractions(state)).toContainEqual(expect.objectContaining({
      id: 'resonant-seam',
      label: 'Escuchar la junta con la Lámina Resonante',
    }));

    state = chroniclesTacticsUse(state, 'resonant-seam');
    expect(state.blackGlassDoorFound).toBe(true);
    expect(chroniclesQuestEntries(state).map((quest) => quest.id)).not.toContain('through-black-glass');
    expect(chroniclesTacticsInteractions(state)).toContainEqual(expect.objectContaining({
      id: 'black-glass-secret-door',
      label: 'Abrir puerta de vidrio negro',
    }));

    const entered = chroniclesTacticsUse(state, 'black-glass-secret-door');
    expect(entered.mapId).toBe('black-glass-chapel');
    expect({ x: entered.x, y: entered.y, direction: entered.direction }).toEqual({ x: 1, y: 1, direction: 1 });
    expect(chroniclesInventoryEntries(entered).map((item) => item.id)).not.toContain('resonant-lamina');
    expect(chroniclesInventoryEntries(entered).map((item) => item.id)).not.toContain('bell-key');
    expect(chroniclesQuestEntries(entered).find((quest) => quest.id === 'silence-chain-basilica')).toMatchObject({
      status: 'completed',
      objective: 'Basílica superada por la ruta secreta.',
    });
    expect(chroniclesQuestEntries(entered).find((quest) => quest.id === 'through-black-glass')).toMatchObject({
      status: 'active',
      objective: 'Explora la Capilla de Vidrio Negro y encuentra qué protege.',
    });
  });

  it('claims the prism and rejoins the Bell Tower while the optional mirror wisp survives', () => {
    let state = chroniclesMapTransitionState(createChroniclesState(), 'black-glass-chapel');
    state = chroniclesApplyContentEffects(state, [{
      type: 'start-quest',
      questId: 'through-black-glass',
      title: 'Tras el vidrio negro',
      description: 'Prueba de ruta lateral.',
      objective: 'Explora la Capilla de Vidrio Negro y encuentra qué protege.',
      order: 75,
    }]);
    state = {
      ...state,
      glassDeaconHp: 0,
      obsidianSpiderHp: 0,
      reflectionHoundHp: 0,
      mirrorWispHp: 5,
      x: 5,
      y: 3,
    };

    expect(chroniclesTacticsInteractions(state)).toContainEqual(expect.objectContaining({
      id: 'chapel-prism',
      label: 'Extraer Prisma de Vidrio Negro',
    }));

    state = chroniclesTacticsUse(state, 'chapel-prism');
    expect(state.chapelPrismClaimed).toBe(true);
    expect(chroniclesInventoryEntries(state)).toContainEqual(expect.objectContaining({
      id: 'black-glass-prism',
      name: 'Prisma de Vidrio Negro',
      quantity: 1,
    }));
    expect(chroniclesQuestEntries(state).find((quest) => quest.id === 'through-black-glass')).toMatchObject({
      status: 'active',
      objective: 'Encuentra la salida de la Capilla de Vidrio Negro.',
    });

    state = { ...state, x: 6, y: 1 };
    const tower = chroniclesTacticsUse(state, 'black-glass-chapel-exit');

    expect(tower.mapId).toBe('hollow-bell-tower');
    expect(tower.phase).toBe('explore');
    expect(tower.mirrorWispHp).toBe(0);
    expect(tower.tollWispHp).toBe(5);
    expect(chroniclesInventoryEntries(tower)).toContainEqual(expect.objectContaining({
      id: 'black-glass-prism',
      quantity: 1,
    }));
    expect(chroniclesQuestEntries(tower).find((quest) => quest.id === 'through-black-glass')).toMatchObject({
      status: 'completed',
      objective: 'Capilla secreta superada.',
    });
    expect(tower.journal.at(-1)?.id).toBe('black-glass-chapel-cleared');
  });
});
