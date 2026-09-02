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
      item.map?.dispose?.();
      item.roughnessMap?.dispose?.();
      item.bumpMap?.dispose?.();
      item.dispose?.();
    }
  });
}

describe('War Room castle architecture', () => {
  const theme = { felt: 0x173943, glow: 0xc5963f };

  it('cierra la sala con suelo de piedra premium y paredes laterales a profundidad completa', () => {
    const room = buildPremiumWarRoomLayer(theme, true, false);
    const architecture = room.getObjectByName('war-room-castle-architecture');
    const floor = room.getObjectByName('war-room-castle-floor');
    const leftWall = room.getObjectByName('war-room-castle-wall-left');
    const rightWall = room.getObjectByName('war-room-castle-wall-right');
    const warmTiles = room.getObjectByName('war-room-castle-floor-tiles-warm');
    const coolTiles = room.getObjectByName('war-room-castle-floor-tiles-cool');

    expect(architecture).toBeInstanceOf(THREE.Group);
    expect(architecture.userData.warRoomArchitecture).toBe('european-castle');
    expect(floor).toBeInstanceOf(THREE.Group);
    expect(floor.userData.warRoomSurface).toBe('stone-tiles');
    expect(floor.userData.warRoomFinish).toBe('polished-european-stone');
    expect(floor.userData.warRoomPremiumTileCount).toBe(72);
    expect(warmTiles).toBeInstanceOf(THREE.InstancedMesh);
    expect(coolTiles).toBeInstanceOf(THREE.InstancedMesh);
    expect(warmTiles.count + coolTiles.count).toBe(72);
    expect(room.getObjectByName('war-room-castle-floor-inlay-left')).toBeTruthy();
    expect(room.getObjectByName('war-room-castle-floor-inlay-right')).toBeTruthy();

    expect(leftWall).toBeInstanceOf(THREE.Mesh);
    expect(rightWall).toBeInstanceOf(THREE.Mesh);
    expect(leftWall.userData.warRoomWallSide).toBe('left');
    expect(rightWall.userData.warRoomWallSide).toBe('right');
    expect(leftWall.userData.warRoomFullDepth).toBe(true);
    expect(rightWall.userData.warRoomFullDepth).toBe(true);
    expect(leftWall.geometry.parameters.depth).toBeGreaterThan(13);
    expect(rightWall.geometry.parameters.depth).toBeGreaterThan(13);

    expect(leftWall.material.userData.warRoomWallFinish).toBe('warm-limestone-plaster-v1');
    expect(rightWall.material.userData.warRoomWallFinish).toBe('warm-limestone-plaster-v1');
    expect(leftWall.material.map).toBeInstanceOf(THREE.DataTexture);
    expect(leftWall.material.map.userData.warRoomWallTexture).toBe('warm-limestone-plaster-v1');
    expect(room.getObjectByName('war-room-castle-wall-panel-left-1')?.userData.warRoomWallPanel).toBe('limestone-inset');
    expect(room.getObjectByName('war-room-castle-wall-panel-right-1')?.userData.warRoomWallPanel).toBe('limestone-inset');

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
    const floor = room.getObjectByName('war-room-castle-floor');
    const leftWall = room.getObjectByName('war-room-castle-wall-left');
    expect(floor).toBeTruthy();
    expect(floor.userData.warRoomFinish).toBe('simplified-castle-stone');
    expect(room.getObjectByName('war-room-castle-floor-tiles-warm')).toBeFalsy();
    expect(room.getObjectByName('war-room-castle-floor-tiles-cool')).toBeFalsy();
    expect(room.getObjectByName('war-room-castle-side-walls')).toBeTruthy();
    expect(leftWall.geometry.parameters.depth).toBe(8.9);
    expect(leftWall.userData.warRoomFullDepth).toBe(false);
    expect(leftWall.material.userData.warRoomWallFinish).toBe('simplified-castle-stone');
    expect(leftWall.material.map).toBeFalsy();
    expect(room.getObjectByName('war-room-castle-wall-panel-left-1')).toBeFalsy();
    expect(room.getObjectByName('war-room-sofa-left').userData.warRoomFurniturePlacement).toBe('side-wall');
    expect(room.getObjectByName('war-room-sofa-right').userData.warRoomFurniturePlacement).toBe('side-wall');
    dispose(room);
  });
});
