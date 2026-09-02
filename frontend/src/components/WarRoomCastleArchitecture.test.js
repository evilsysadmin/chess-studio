import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildPremiumWarRoomLayer } from './PremiumWarRoomScene.js';

function dispose(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse((object) => {
    if (object.geometry && !geometries.has(object.geometry)) {
      geometries.add(object.geometry);
      object.geometry.dispose?.();
    }
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const item of list) {
      if (!item || materials.has(item)) continue;
      materials.add(item);
      item.dispose?.();
    }
  });
}

describe('War Room castle architecture', () => {
  const theme = { felt: 0x173943, glow: 0xc5963f };

  it('cierra la sala con suelo de baldosas y paredes laterales europeas', () => {
    const room = buildPremiumWarRoomLayer(theme, true, false);
    const architecture = room.getObjectByName('war-room-castle-architecture');
    const floor = room.getObjectByName('war-room-castle-floor');
    const leftWall = room.getObjectByName('war-room-castle-wall-left');
    const rightWall = room.getObjectByName('war-room-castle-wall-right');

    expect(architecture).toBeInstanceOf(THREE.Group);
    expect(architecture.userData.warRoomArchitecture).toBe('european-castle');
    expect(floor).toBeInstanceOf(THREE.Group);
    expect(floor.userData.warRoomSurface).toBe('stone-tiles');
    expect(leftWall).toBeInstanceOf(THREE.Mesh);
    expect(rightWall).toBeInstanceOf(THREE.Mesh);
    expect(leftWall.userData.warRoomWallSide).toBe('left');
    expect(rightWall.userData.warRoomWallSide).toBe('right');

    dispose(room);
  });

  it('mueve los dos sofás a los laterales y los orienta hacia la mesa', () => {
    for (const whiteSide of [true, false]) {
      const room = buildPremiumWarRoomLayer(theme, whiteSide, false);
      const left = room.getObjectByName('war-room-sofa-left');
      const right = room.getObjectByName('war-room-sofa-right');

      expect(left.userData.warRoomFurniturePlacement).toBe('side-wall');
      expect(right.userData.warRoomFurniturePlacement).toBe('side-wall');
      expect(left.userData.facesWarTable).toBe(true);
      expect(right.userData.facesWarTable).toBe(true);
      expect(left.position.x).toBeLessThan(-6);
      expect(right.position.x).toBeGreaterThan(6);
      expect(Math.abs(Math.abs(left.rotation.y) - Math.PI / 2)).toBeLessThan(0.001);
      expect(Math.abs(Math.abs(right.rotation.y) - Math.PI / 2)).toBeLessThan(0.001);

      dispose(room);
    }
  });

  it('mantiene callable el hook de render del fuego al ceder la animación al driver del castillo', () => {
    const room = buildPremiumWarRoomLayer(theme, true, false);
    const driver = room.getObjectByName('war-room-castle-floor-slab');
    const flame = room.getObjectByName('war-room-fire-flame-outer');

    expect(typeof driver.onBeforeRender).toBe('function');
    expect(typeof flame.onBeforeRender).toBe('function');

    driver.onBeforeRender();

    expect(flame.userData.castleDriverOwnsFire).toBe(true);
    expect(typeof flame.onBeforeRender).toBe('function');
    expect(() => flame.onBeforeRender()).not.toThrow();
    expect(room.getObjectByName('war-room-fire-core').userData.warRoomWarmFireAnimated).toBe(true);
    expect(room.getObjectByName('war-room-fire-bounce-light')).toBeInstanceOf(THREE.PointLight);

    dispose(room);
  });

  it('mantiene la arquitectura simplificada también en móvil', () => {
    const room = buildPremiumWarRoomLayer(theme, true, true);
    expect(room.getObjectByName('war-room-castle-floor')).toBeTruthy();
    expect(room.getObjectByName('war-room-castle-side-walls')).toBeTruthy();
    expect(room.getObjectByName('war-room-sofa-left').userData.warRoomFurniturePlacement).toBe('side-wall');
    expect(room.getObjectByName('war-room-sofa-right').userData.warRoomFurniturePlacement).toBe('side-wall');
    dispose(room);
  });
});