import { describe, expect, it } from 'vitest';
import {
  WAR_ROOM_CANONICAL_PLANT_PLACEMENT_VERSION,
  lockWarRoomCanonicalPlantPlacement,
} from './WarRoomPlantCanonicalPlacement.js';

function makeRoot({ anchor = { x: 7.05, z: 2.85 } } = {}) {
  const plant = {
    position: { x: 5.5, y: -0.255, z: 1.2 },
    userData: {},
  };
  const weatherWindow = {
    userData: { warRoomPlantAnchor: anchor },
  };
  const root = {
    userData: {},
    getObjectByName(name) {
      if (name === 'war-room-hans-plant') return plant;
      if (name === 'war-room-weather-window') return weatherWindow;
      return null;
    },
  };
  return { root, plant };
}

describe('War Room canonical plant placement', () => {
  it('locks the plant to the stable weather-window corner instead of the board edge', () => {
    const { root, plant } = makeRoot();

    expect(lockWarRoomCanonicalPlantPlacement(root)).toBe(1);
    expect(plant.position.x).toBeCloseTo(7.05, 5);
    expect(plant.position.z).toBeCloseTo(2.85, 5);
    expect(plant.position.y).toBeCloseTo(-0.255, 5);
    expect(plant.userData.warRoomPlantPlacement).toBe('canonical-weather-window-corner-v15');
    expect(plant.userData.warRoomPlantBoardClearance).toBe('outside-table-footprint');
    expect(plant.userData.warRoomCanonicalPlacement).toBe(WAR_ROOM_CANONICAL_PLANT_PLACEMENT_VERSION);
    expect(root.userData.warRoomCanonicalPlantPlacement).toBe(WAR_ROOM_CANONICAL_PLANT_PLACEMENT_VERSION);
  });

  it('refuses incomplete anchors instead of inventing a fallback position', () => {
    const { root, plant } = makeRoot({ anchor: { x: 7.05 } });
    const before = { ...plant.position };

    expect(lockWarRoomCanonicalPlantPlacement(root)).toBe(0);
    expect(plant.position).toEqual(before);
  });
});
