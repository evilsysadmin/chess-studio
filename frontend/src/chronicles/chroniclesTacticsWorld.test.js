import { describe, expect, it } from 'vitest';
import { createChroniclesState } from '../chroniclesOfMatthias.js';
import { chroniclesTacticsInteractions } from '../chroniclesOfMatthiasTactics.js';
import { chroniclesMapForState } from './chroniclesMapCatalog.js';

describe('Chronicles Tactics map-authored world', () => {
  it('discovers contextual interactions from active-map content without engine-owned ids or coordinates', () => {
    const state = createChroniclesState();
    const map = chroniclesMapForState(state);
    const authoredEntries = [
      ...(Array.isArray(map.interactables) ? map.interactables : []),
      ...(Array.isArray(map.treasures) ? map.treasures : []),
    ].filter((entry) => Number.isInteger(entry?.x) && Number.isInteger(entry?.y));

    const discoverable = authoredEntries.find((entry) => (
      chroniclesTacticsInteractions({ ...state, x: entry.x, y: entry.y })
        .some((candidate) => candidate.id === entry.id)
    ));

    expect(discoverable).toBeTruthy();
    expect(chroniclesTacticsInteractions({
      ...state,
      x: discoverable.x,
      y: discoverable.y,
    })).toContainEqual(expect.objectContaining({
      id: discoverable.id,
      x: discoverable.x,
      y: discoverable.y,
    }));
  });
});
