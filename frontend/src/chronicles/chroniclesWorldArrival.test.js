import { describe, expect, it } from 'vitest';
import { chroniclesMapById, chroniclesMapContentPosition } from './chroniclesMapCatalog.js';
import { chroniclesApplyContentEffects } from './chroniclesContentRuntime.js';

const inCrypt = { mapId: 'crypt-eight-squares', x: 1, y: 5, direction: 1, phase: 'explore', party: [] };

describe('Chronicles return-door arrivals', () => {
  it('preserves legacy partyStart on transitions without an entry exit', () => {
    const arrival = chroniclesApplyContentEffects(inCrypt, [
      { type: 'transition-map', mapId: 'gallery-of-forks' },
    ]);
    const map = chroniclesMapById('gallery-of-forks');
    expect({ x: arrival.x, y: arrival.y, direction: arrival.direction }).toEqual(map.partyStart);
  });

  it('places travellers at the destination doorway when entryExitId is authored', () => {
    const destination = chroniclesMapById('gallery-of-forks');
    const entry = destination.exits.find((exit) => exit.id === 'gallery-gate');
    const point = chroniclesMapContentPosition(destination, entry);
    const arrival = chroniclesApplyContentEffects(inCrypt, [
      { type: 'transition-map', mapId: destination.id, entryExitId: entry.id },
    ]);
    expect({ x: arrival.x, y: arrival.y }).toEqual(point);
    expect(arrival.mapId).toBe(destination.id);
    expect(arrival.phase).toBe('explore');
  });

  it('rejects an authored return door missing from the target map', () => {
    expect(() => chroniclesApplyContentEffects(inCrypt, [
      { type: 'transition-map', mapId: 'gallery-of-forks', entryExitId: 'vanished-door' },
    ])).toThrow(/missing entry exit/i);
  });
});
