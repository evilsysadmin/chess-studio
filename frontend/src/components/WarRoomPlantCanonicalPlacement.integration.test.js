import { describe, expect, it } from 'vitest';
import { lockWarRoomCanonicalPlantPlacement } from './WarRoomPlantCanonicalPlacement.js';

function namedRoot() {
  const plant = {
    position: { x: 5.5, y: -0.255, z: 1.2 },
    userData: { warRoomPlantPlacement: 'beside-right-sofa-room-side-v13' },
  };
  const weatherWindow = {
    userData: { warRoomPlantAnchor: { x: 7.05, z: 2.85 } },
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

describe('War Room plant regression from sofa-relative placement', () => {
  it('overrides the board-adjacent sofa position with the canonical upper-right corner', () => {
    const { root, plant } = namedRoot();
    expect(plant.position.x).toBe(5.5);

    lockWarRoomCanonicalPlantPlacement(root);

    expect(plant.position.x).toBe(7.05);
    expect(plant.position.z).toBe(2.85);
    expect(plant.userData.warRoomPlantPlacement).toBe('canonical-weather-window-corner-v15');
  });
});
