import { describe, expect, it } from 'vitest';
import { createChroniclesState } from '../chroniclesOfMatthias.js';
import {
  chroniclesTacticsInteractions,
  chroniclesTacticsWorld,
} from '../chroniclesOfMatthiasTactics.js';
import { chroniclesMapForState } from './chroniclesMapCatalog.js';

describe('Chronicles Tactics map-authored world', () => {
  it('derives lever and treasure positions from the active map instead of engine coordinates', () => {
    const state = createChroniclesState();
    const map = chroniclesMapForState(state);
    const world = chroniclesTacticsWorld(state);

    expect(world.lever).toEqual(map.interactables.find((entry) => entry.kind === 'lever'));
    expect(world.runeCore).toEqual(map.treasures.find((entry) => entry.id === 'rune-core'));
  });

  it('discovers contextual interactions at map-authored coordinates', () => {
    const state = createChroniclesState();
    const { lever, runeCore } = chroniclesTacticsWorld(state);

    expect(chroniclesTacticsInteractions({ ...state, x: lever.x, y: lever.y })).toEqual([
      expect.objectContaining({ id: lever.id, x: lever.x, y: lever.y, kind: 'lever' }),
    ]);

    expect(chroniclesTacticsInteractions({
      ...state,
      x: runeCore.x,
      y: runeCore.y,
      runeCacheOpened: true,
    })).toEqual([
      expect.objectContaining({ id: runeCore.id, x: runeCore.x, y: runeCore.y, kind: 'pickup' }),
    ]);
  });
});
