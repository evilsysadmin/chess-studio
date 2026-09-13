import { describe, expect, it } from 'vitest';
import { lockWarRoomCanonicalPlantPlacement } from './WarRoomPlantCanonicalPlacement.js';

function rootWithPlant(x = 5.77, z = 3.37) {
  const plant = { position: { x, y: -0.255, z }, userData: {} };
  const weatherWindow = { userData: { warRoomPlantAnchor: { x: 7.05, z: 2.85 } } };
  return {
    plant,
    root: {
      userData: {},
      getObjectByName(name) {
        if (name === 'war-room-hans-plant') return plant;
        if (name === 'war-room-weather-window') return weatherWindow;
        return null;
      },
    },
  };
}

describe('War Room plant final placement ordering', () => {
  it('wins after any earlier sofa-relative ensure pass', () => {
    const { root, plant } = rootWithPlant();
    plant.userData.warRoomPlantPlacement = 'beside-right-sofa-room-side-v13';

    expect(lockWarRoomCanonicalPlantPlacement(root)).toBe(1);
    expect(plant.position.x).toBe(7.05);
    expect(plant.position.z).toBe(2.85);
    expect(plant.userData.warRoomPlantPlacement).toBe('canonical-weather-window-corner-v15');
  });
});
