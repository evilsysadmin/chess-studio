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

describe('Chronicles Blind King Archive', () => {
  it('continues the main campaign from Menagerie into a larger fifth map', () => {
    expect(chroniclesMapIds()).toContain('blind-king-archive');
    const archive = chroniclesMapById('blind-king-archive');
    expect(archive.version).toBe(2);
    expect(archive.title).toBe('Archivo del Rey Ciego');
    expect(archive.grid).toHaveLength(9);
    expect(archive.grid[0]).toHaveLength(11);
    expect(archive.enemies).toHaveLength(5);
    expect(archive.enemies.find((enemy) => enemy.id === 'archive-wisp')?.optional).toBe(true);

    let state = chroniclesMapTransitionState(createChroniclesState(), 'menagerie-of-ash');
    state = {
      ...state,
      x: 4,
      y: 1,
      ashGoblinHp: 0,
      cryptSpiderHp: 0,
      boneHoundHp: 0,
      emberWispHp: 4,
    };

    const entered = chroniclesTacticsUse(state, 'menagerie-gate');

    expect(entered.mapId).toBe('blind-king-archive');
    expect({ x: entered.x, y: entered.y, direction: entered.direction }).toEqual({ x: 1, y: 7, direction: 1 });
    expect(entered.phase).toBe('explore');
    expect(entered.ledgerWardenHp).toBe(9);
    expect(entered.blindArchivistHp).toBe(7);
    expect(entered.inkHoundHp).toBe(6);
    expect(entered.catalogueSpiderHp).toBe(5);
    expect(entered.archiveWispHp).toBe(4);
    expect(entered.journal.at(-1)?.id).toBe('menagerie-archive-crossing');
  });

  it('runs a multi-step key and index quest, keeps the wisp optional and continues into Foundry', () => {
    const archive = chroniclesMapById('blind-king-archive');
    const warden = archive.enemies.find((enemy) => enemy.id === 'ledger-warden');
    let state = chroniclesMapTransitionState(createChroniclesState(), 'blind-king-archive');

    expect(chroniclesTacticsInteractions(state)).toContainEqual(expect.objectContaining({
      id: 'archive-plaque',
      label: 'Leer protocolo del archivo',
    }));
    state = chroniclesTacticsUse(state, 'archive-plaque');
    expect(chroniclesQuestEntries(state).find((quest) => quest.id === 'blind-kings-index')).toMatchObject({
      status: 'active',
      objective: 'Derriba al Guardián del Índice y recupera la Llave de Marfil.',
    });

    state = chroniclesApplyContentEffects(state, warden.onDefeat.effects);
    state = { ...state, ledgerWardenHp: 0, x: 6, y: 3 };
    expect(chroniclesInventoryEntries(state)).toContainEqual(expect.objectContaining({
      id: 'ivory-index-key',
      name: 'Llave de Marfil',
      quantity: 1,
    }));
    expect(chroniclesTacticsInteractions(state)).toContainEqual(expect.objectContaining({
      id: 'sealed-index',
      label: 'Desbloquear índice sellado',
    }));

    state = chroniclesTacticsUse(state, 'sealed-index');
    expect(state.archiveIndexUnlocked).toBe(true);
    expect(chroniclesInventoryEntries(state).map((item) => item.id)).not.toContain('ivory-index-key');
    expect(chroniclesQuestEntries(state).find((quest) => quest.id === 'blind-kings-index')).toMatchObject({
      status: 'active',
      objective: 'Llega al ala oriental y recupera el Índice Ciego.',
    });

    state = {
      ...state,
      blindArchivistHp: 0,
      inkHoundHp: 0,
      catalogueSpiderHp: 0,
      archiveWispHp: 4,
      x: 8,
      y: 4,
    };
    expect(chroniclesTacticsInteractions(state)).toContainEqual(expect.objectContaining({
      id: 'blind-index',
      label: 'Recuperar Índice Ciego',
    }));
    state = chroniclesTacticsUse(state, 'blind-index');

    expect(state.archiveIndexRead).toBe(true);
    expect(chroniclesInventoryEntries(state)).toContainEqual(expect.objectContaining({
      id: 'blind-king-seal',
      name: 'Sello del Rey Ciego',
      quantity: 1,
    }));
    expect(chroniclesQuestEntries(state).find((quest) => quest.id === 'blind-kings-index')).toMatchObject({
      status: 'completed',
      objective: 'Índice recuperado. Busca la salida.',
    });

    state = { ...state, x: 9, y: 2 };
    const foundry = chroniclesTacticsUse(state, 'archive-east-gate');
    expect(foundry.mapId).toBe('iron-foundry');
    expect(foundry.phase).toBe('explore');
    expect({ x: foundry.x, y: foundry.y, direction: foundry.direction }).toEqual({ x: 1, y: 1, direction: 1 });
    expect(foundry.archiveWispHp).toBe(0);
    expect(foundry.ironSentinelHp).toBe(10);
    expect(foundry.chainHoundHp).toBe(7);
    expect(foundry.slagCrawlerHp).toBe(6);
    expect(foundry.emberArtificerHp).toBe(6);
    expect(foundry.scrapGoblinHp).toBe(5);
    expect(foundry.journal.at(-1)?.id).toBe('blind-archive-cleared');
  });

  it('rewards the previous secret route without making its trophy mandatory', () => {
    let state = chroniclesMapTransitionState(createChroniclesState(), 'blind-king-archive');
    state = chroniclesApplyContentEffects(state, [{
      type: 'grant-item',
      itemId: 'obsidian-idol',
      name: 'Ídolo de Obsidiana',
      description: 'Prueba de continuidad de la ruta secreta.',
      quantity: 1,
    }]);
    state = { ...state, x: 7, y: 1 };

    expect(chroniclesTacticsInteractions(state)).toContainEqual(expect.objectContaining({
      id: 'obsidian-index-cache',
      label: 'Encajar Ídolo de Obsidiana',
    }));
    state = chroniclesTacticsUse(state, 'obsidian-index-cache');

    expect(state.obsidianCacheOpened).toBe(true);
    expect(chroniclesInventoryEntries(state)).toContainEqual(expect.objectContaining({
      id: 'obsidian-idol',
      quantity: 1,
    }));
    expect(chroniclesInventoryEntries(state)).toContainEqual(expect.objectContaining({
      id: 'royal-cipher',
      name: 'Cifra Real',
      quantity: 1,
    }));
  });
});