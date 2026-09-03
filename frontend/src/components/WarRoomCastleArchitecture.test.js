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

  it('cierra la sala con sillería oscura coherente y paredes laterales a profundidad completa', () => {
    const room = buildPremiumWarRoomLayer(theme, true, false);
    const architecture = room.getObjectByName('war-room-castle-architecture');
    const floor = room.getObjectByName('war-room-castle-floor');
    const leftWall = room.getObjectByName('war-room-castle-wall-left');
    const rightWall = room.getObjectByName('war-room-castle-wall-right');

    expect(architecture).toBeInstanceOf(THREE.Group);
    expect(architecture.userData.warRoomArchitecture).toBe('european-castle');
    expect(architecture.userData.warRoomCastleStyle).toBe('dark-germanic-ashlar-v3');
    expect(floor).toBeInstanceOf(THREE.Group);
    expect(floor.userData.warRoomSurface).toBe('stone-slab');
    expect(floor.userData.warRoomFinish).toBe('restrained-limestone-slab');
    expect(floor.userData.warRoomJointSpacing).toBeGreaterThan(4);
    expect(room.getObjectByName('war-room-castle-floor-tiles-warm')).toBeFalsy();
    expect(room.getObjectByName('war-room-castle-floor-tiles-cool')).toBeFalsy();
    expect(room.getObjectByName('war-room-castle-floor-inlay-left')).toBeFalsy();
    expect(room.getObjectByName('war-room-castle-floor-inlay-right')).toBeFalsy();

    expect(leftWall).toBeInstanceOf(THREE.Mesh);
    expect(rightWall).toBeInstanceOf(THREE.Mesh);
    expect(leftWall.userData.warRoomWallSide).toBe('left');
    expect(rightWall.userData.warRoomWallSide).toBe('right');
    expect(leftWall.userData.warRoomFullDepth).toBe(true);
    expect(rightWall.userData.warRoomFullDepth).toBe(true);
    expect(leftWall.geometry.parameters.depth).toBeGreaterThan(13);
    expect(rightWall.geometry.parameters.depth).toBeGreaterThan(13);

    expect(leftWall.material.userData.warRoomWallFinish).toBe('dark-germanic-ashlar-v3');
    expect(rightWall.material.userData.warRoomWallFinish).toBe('dark-germanic-ashlar-v3');
    expect(leftWall.material.map).toBeInstanceOf(THREE.DataTexture);
    expect(leftWall.material.map.userData.warRoomWallTexture).toBe('dark-germanic-ashlar-v3');
    expect(leftWall.material.map.userData.resolution).toEqual([96, 96]);
    expect(room.getObjectByName('war-room-castle-wall-panel-left-1')?.userData.warRoomWallPanel).toBe('dark-ashlar-inset');
    expect(room.getObjectByName('war-room-castle-wall-panel-right-1')?.userData.warRoomWallPanel).toBe('dark-ashlar-inset');

    dispose(room);
  });

  it('mantiene las armaduras a escala humana del decorado, no como gigantes', () => {
    const room = buildPremiumWarRoomLayer(theme, true, false);
    const left = room.getObjectByName('war-room-armor-guard-left');
    const right = room.getObjectByName('war-room-armor-guard-right');

    expect(left).toBeInstanceOf(THREE.Group);
    expect(right).toBeInstanceOf(THREE.Group);
    expect(left.userData.warRoomScaleReference).toBe('two-piece-heights');
    expect(right.userData.warRoomScaleReference).toBe('two-piece-heights');
    expect(left.getObjectByName('war-room-armor-zweihander')).toBeTruthy();
    expect(right.getObjectByName('war-room-armor-zweihander')).toBeTruthy();

    const size = new THREE.Box3().setFromObject(left).getSize(new THREE.Vector3());
    expect(size.y).toBeGreaterThan(1.8);
    expect(size.y).toBeLessThan(2.8);
    expect(size.x).toBeLessThan(1.5);

    dispose(room);
  });

  it('da a los cuadros dos siluetas de galería distintas', () => {
    const room = buildPremiumWarRoomLayer(theme, true, false);
    const left = room.getObjectByName('war-room-premium-painting-0');
    const right = room.getObjectByName('war-room-premium-painting-1');

    expect(left.userData.warRoomGalleryVariant).toBe('alpine-fortress');
    expect(right.userData.warRoomGalleryVariant).toBe('rhine-castle');
    expect(left.scale.x).not.toBe(right.scale.x);
    expect(left.scale.y).not.toBe(right.scale.y);
    expect(left.getObjectByName('war-room-gallery-finial')).toBeTruthy();
    expect(right.getObjectByName('war-room-gallery-medallion')).toBeTruthy();

    dispose(room);
  });

  it('separa sofás y consolas y mantiene los sofás orientados hacia la mesa', () => {
    for (const whiteSide of [true, false]) {
      const room = buildPremiumWarRoomLayer(theme, whiteSide, false);
      const driver = room.getObjectByName('war-room-premium-painting-canvas');
      const left = room.getObjectByName('war-room-sofa-left');
      const right = room.getObjectByName('war-room-sofa-right');
      const leftConsole = room.getObjectByName('war-room-side-console-left');
      const rightConsole = room.getObjectByName('war-room-side-console-right');
      const leftArmor = room.getObjectByName('war-room-teutonic-armor-left');
      const rightArmor = room.getObjectByName('war-room-teutonic-armor-right');

      expect(typeof driver?.onBeforeRender).toBe('function');
      driver.onBeforeRender();

      expect(left.userData.warRoomFurniturePlacement).toBe('approved-mock-front-corner-sofa-v27');
      expect(right.userData.warRoomFurniturePlacement).toBe('approved-mock-front-corner-sofa-v27');
      expect(left.userData.facesWarTable).toBe(true);
      expect(right.userData.facesWarTable).toBe(true);
      expect(left.position.x).toBeLessThan(-6);
      expect(right.position.x).toBeGreaterThan(6);
      expect(Math.abs(Math.abs(left.rotation.y) - Math.PI / 2)).toBeLessThan(0.001);
      expect(Math.abs(Math.abs(right.rotation.y) - Math.PI / 2)).toBeLessThan(0.001);

      expect(leftConsole.userData.warRoomFurniture).toBe('side-console');
      expect(rightConsole.userData.warRoomFurniture).toBe('side-console');
      expect(leftConsole.userData.warRoomFurniturePlacement).toBe('approved-mock-rear-table-v27');
      expect(rightConsole.userData.warRoomFurniturePlacement).toBe('approved-mock-rear-table-v27');
      expect(leftConsole.userData.warRoomOffsetFromWall).toBeCloseTo(3.3, 5);
      expect(rightConsole.userData.warRoomOffsetFromWall).toBeCloseTo(3.3, 5);
      expect(leftArmor.userData.warRoomOffsetFromWall).toBeCloseTo(8.35, 5);
      expect(rightArmor.userData.warRoomOffsetFromWall).toBeCloseTo(8.35, 5);
      expect(left.userData.warRoomOffsetFromWall).toBeCloseTo(12.35, 5);
      expect(right.userData.warRoomOffsetFromWall).toBeCloseTo(12.35, 5);
      expect(Math.abs(left.position.z - leftConsole.position.z)).toBeGreaterThanOrEqual(8.9);
      expect(Math.abs(right.position.z - rightConsole.position.z)).toBeGreaterThanOrEqual(8.9);
      expect(Math.abs(left.position.z - leftArmor.position.z)).toBeGreaterThanOrEqual(3.9);
      expect(Math.abs(right.position.z - rightArmor.position.z)).toBeGreaterThanOrEqual(3.9);

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
    expect(floor.userData.warRoomSurface).toBe('stone-tiles');
    expect(floor.userData.warRoomFinish).toBe('simplified-castle-stone');
    expect(floor.userData.warRoomJointSpacing).toBe(2.55);
    expect(room.getObjectByName('war-room-castle-floor-tiles-warm')).toBeFalsy();
    expect(room.getObjectByName('war-room-castle-floor-tiles-cool')).toBeFalsy();
    expect(room.getObjectByName('war-room-castle-side-walls')).toBeTruthy();
    expect(leftWall.geometry.parameters.depth).toBe(8.9);
    expect(leftWall.userData.warRoomFullDepth).toBe(false);
    expect(leftWall.material.userData.warRoomWallFinish).toBe('simplified-dark-castle-stone');
    expect(leftWall.material.map).toBeFalsy();
    expect(room.getObjectByName('war-room-castle-wall-panel-left-1')).toBeFalsy();
    expect(room.getObjectByName('war-room-armor-guard-left')).toBeTruthy();
    expect(room.getObjectByName('war-room-armor-guard-right')).toBeTruthy();
    expect(room.getObjectByName('war-room-sofa-left').userData.warRoomFurniturePlacement).toBe('side-wall');
    expect(room.getObjectByName('war-room-sofa-right').userData.warRoomFurniturePlacement).toBe('side-wall');
    dispose(room);
  });
});