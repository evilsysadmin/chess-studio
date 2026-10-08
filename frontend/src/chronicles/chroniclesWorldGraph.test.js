import { describe, expect, it } from 'vitest';
import {
  CHRONICLES_WORLD_LOCATIONS,
  CHRONICLES_WORLD_START,
  chroniclesWorldDestination,
  validateChroniclesWorldGraph,
} from './chroniclesWorldGraph.js';

describe('Chronicles campaign starter world', () => {
  it('has an accessible, connected and bidirectional capital → road → crypt loop', () => {
    expect(validateChroniclesWorldGraph()).toBe(true);
    let locationId = CHRONICLES_WORLD_START;
    for (const exitId of ['east-road', 'ruin-entrance', 'ruin-exit', 'west-gate']) {
      const destination = chroniclesWorldDestination(locationId, exitId);
      expect(destination).not.toBeNull();
      locationId = destination.locationId;
    }
    expect(locationId).toBe(CHRONICLES_WORLD_START);
  });

  it('rejects unknown transitions without inventing a destination', () => {
    expect(chroniclesWorldDestination('missing', 'east-road')).toBeNull();
    expect(chroniclesWorldDestination(CHRONICLES_WORLD_START, 'ruin-entrance')).toBeNull();
  });

  it('uses the existing dungeon map rather than introducing a duplicate level', () => {
    expect(CHRONICLES_WORLD_LOCATIONS['old-crypt'].dungeonMapId).toBe('crypt-eight-squares');
  });
});
