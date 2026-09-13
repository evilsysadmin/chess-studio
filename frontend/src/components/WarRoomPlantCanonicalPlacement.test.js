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
  const sofa = {
    position: { x: 6.55, y: 0.02, z: 4.95 },
  };
  const weatherWindow = {
    userData: { warRoomPlantAnchor: anchor },
  };
  const root = {
    userData: {},
    getObjectByName(name) {
      if (name === 'war-room-hans-plant') return plant;
      if (name === 'war-room-weather-window') return weatherWindow;
      if (name === 'war-room-sofa-right') return sofa;
      return null;
    },
  };
  return { root, plant, sofa };
}

describe('War Room canonical plant placement', () => {
  it('locks the right plant to the visible room-side end of the sofa, not behind it at the window', () => {
    const { root, plant, sofa } = makeRoot();

    expect(lockWarRoomCanonicalPlantPlacement(root)).toBe(1);
    expect(plant.position.x).toBeCloseTo(5.77, 5);
    expect(plant.position.z).toBeCloseTo(3.37, 5);
    expect(plant.position.y).toBeCloseTo(-0.255, 5);
    expect(plant.position.x).toBeLessThan(sofa.position.x);
    expect(plant.position.z).toBeLessThan(sofa.position.z);
    expect(plant.userData.warRoomPlantPlacement).toBe('canonical-visible-sofa-corner-v16');
    expect(plant.userData.warRoomPlantOcclusionFix).toBe('stable-room-side-sofa-clearance-v16');
    expect(plant.userData.warRoomPlantBoardClearance).toBe('outside-table-footprint');
    expect(plant.userData.warRoomCanonicalPlacement).toBe(WAR_ROOM_CANONICAL_PLANT_PLACEMENT_VERSION);
    expect(root.userData.warRoomCanonicalPlantPlacement).toBe(WAR_ROOM_CANONICAL_PLANT_PLACEMENT_VERSION);
  });

  it('keeps the canonical coordinate stable even if furniture is refined later in the render pipeline', () => {
    const { root, plant, sofa } = makeRoot();
    expect(lockWarRoomCanonicalPlantPlacement(root)).toBe(1);
    const first = { ...plant.position };

    sofa.position.x = 6.28;
    sofa.position.z = 5.42;
    expect(lockWarRoomCanonicalPlantPlacement(root)).toBe(1);
    expect(plant.position).toEqual(first);
  });

  it('mirrors the visible corner placement for the opposite room orientation', () => {
    const { root, plant } = makeRoot({ anchor: { x: -7.05, z: -2.85 } });

    expect(lockWarRoomCanonicalPlantPlacement(root)).toBe(1);
    expect(plant.position.x).toBeCloseTo(-5.77, 5);
    expect(plant.position.z).toBeCloseTo(-3.37, 5);
  });

  it('refuses incomplete anchors instead of inventing a fallback position', () => {
    const { root, plant } = makeRoot({ anchor: { x: 7.05 } });
    const before = { ...plant.position };

    expect(lockWarRoomCanonicalPlantPlacement(root)).toBe(0);
    expect(plant.position).toEqual(before);
  });
});
