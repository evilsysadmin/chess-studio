import { describe, expect, it } from 'vitest';
import { buildPremiumWarRoomLayer } from './PremiumWarRoomScene.js';

const theme = { felt: 0x173943, glow: 0xc5963f };

function dispose(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse((object) => {
    if (object.geometry && !geometries.has(object.geometry)) {
      geometries.add(object.geometry);
      object.geometry.dispose?.();
    }
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material || materials.has(material)) continue;
      materials.add(material);
      material.map?.dispose?.();
      material.roughnessMap?.dispose?.();
      material.bumpMap?.dispose?.();
      material.dispose?.();
    }
  });
}

describe('War Room castle furniture prelayout ownership', () => {
  it('desktop conserva la colocación de construcción hasta que v28 tome ownership', () => {
    const room = buildPremiumWarRoomLayer(theme, true, false);
    const left = room.getObjectByName('war-room-sofa-left');
    const right = room.getObjectByName('war-room-sofa-right');

    expect(room.userData.warRoomDesktopCastleFurniturePrelayoutRetired).toBe(true);
    expect(left.position.x).toBeCloseTo(-5.55, 8);
    expect(right.position.x).toBeCloseTo(5.55, 8);
    expect(left.position.z).toBeCloseTo(-5.18, 8);
    expect(right.position.z).toBeCloseTo(-5.18, 8);
    expect(left.rotation.y).toBeCloseTo(-0.14, 8);
    expect(right.rotation.y).toBeCloseTo(0.14, 8);
    expect(left.userData.warRoomFurniturePlacement).toBeUndefined();
    expect(right.userData.warRoomFurniturePlacement).toBeUndefined();
    expect(left.userData.warRoomOffsetFromWall).toBeUndefined();
    expect(right.userData.warRoomOffsetFromWall).toBeUndefined();

    const driver = room.getObjectByName('war-room-premium-painting-canvas');
    expect(typeof driver?.onBeforeRender).toBe('function');
    driver.onBeforeRender();

    expect(left.userData.warRoomFurniturePlacement).toBe('approved-mock-front-sofa-v28');
    expect(right.userData.warRoomFurniturePlacement).toBe('approved-mock-front-sofa-v28');
    expect(left.userData.warRoomOffsetFromWall).toBeCloseTo(12.55, 8);
    expect(right.userData.warRoomOffsetFromWall).toBeCloseTo(12.55, 8);

    dispose(room);
  });

  it('coarse/mobile conserva el prelayout lateral existente', () => {
    const room = buildPremiumWarRoomLayer(theme, true, true);
    const left = room.getObjectByName('war-room-sofa-left');
    const right = room.getObjectByName('war-room-sofa-right');

    expect(room.userData.warRoomDesktopCastleFurniturePrelayoutRetired).toBeUndefined();
    expect(left.position.x).toBeCloseTo(-6.48, 8);
    expect(right.position.x).toBeCloseTo(6.48, 8);
    expect(left.position.z).toBeCloseTo(-2.15, 8);
    expect(right.position.z).toBeCloseTo(-2.15, 8);
    expect(left.userData.warRoomFurniturePlacement).toBe('side-wall');
    expect(right.userData.warRoomFurniturePlacement).toBe('side-wall');
    expect(left.userData.warRoomOffsetFromWall).toBeCloseTo(5.45, 8);
    expect(right.userData.warRoomOffsetFromWall).toBeCloseTo(5.45, 8);

    dispose(room);
  });
});
