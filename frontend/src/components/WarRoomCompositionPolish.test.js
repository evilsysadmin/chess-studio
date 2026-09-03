import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildPremiumWarRoomLayer } from './PremiumWarRoomScene.js';
import { applyWarRoomCompositionPolish } from './WarRoomCompositionPolish.js';

function dispose(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root.traverse((object) => {
    if (object.geometry && !geometries.has(object.geometry)) {
      geometries.add(object.geometry);
      object.geometry.dispose?.();
    }
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material || materials.has(material)) continue;
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture && !textures.has(value)) {
          textures.add(value);
          value.dispose?.();
        }
      }
      material.dispose?.();
    }
  });
}

function compositionOwner(root) {
  let owner = null;
  root.traverse((object) => {
    if (!owner && object.userData?.warRoomCompositionPolishVersion === 'v10') owner = object;
  });
  return owner;
}

function runRootDriver(room) {
  const driver = room.getObjectByName('war-room-premium-painting-canvas');
  expect(driver?.userData?.warRoomCompositionRootDriver).toBe(true);
  expect(typeof driver?.onBeforeRender).toBe('function');
  driver.onBeforeRender();
}

describe('WarRoomCompositionPolish', () => {
  const theme = { felt: 0x173943, glow: 0xc5963f };

  it('coloca las armaduras v28 contra pared mirando al tablero y retira juntas y mesas laterales', () => {
    const room = buildPremiumWarRoomLayer(theme, true, false);
    const leftArmor = room.getObjectByName('war-room-teutonic-armor-left');
    const rightArmor = room.getObjectByName('war-room-teutonic-armor-right');
    const leftConsole = room.getObjectByName('war-room-side-console-left');
    const rightConsole = room.getObjectByName('war-room-side-console-right');
    const mortarJoints = [];
    room.traverse((object) => {
      if (object.name === 'war-room-teutonic-mortar-joint') mortarJoints.push(object);
    });
    const owner = compositionOwner(room);

    expect(owner).toBeTruthy();
    expect(leftArmor.userData.warRoomArmorPlacement).toBe('approved-mock-wall-sentry-v28');
    expect(rightArmor.userData.warRoomArmorPlacement).toBe('approved-mock-wall-sentry-v28');
    expect(leftArmor.userData.warRoomOffsetFromWall).toBeCloseTo(6.95, 5);
    expect(rightArmor.userData.warRoomOffsetFromWall).toBeCloseTo(6.95, 5);
    expect(leftArmor.userData.warRoomWallClearance).toBeCloseTo(0.19, 5);
    expect(rightArmor.userData.warRoomWallClearance).toBeCloseTo(0.19, 5);
    expect(leftArmor.userData.warRoomArmorLegProfile).toBe('heavy-gothic-v28');
    expect(rightArmor.userData.warRoomArmorLegProfile).toBe('heavy-gothic-v28');
    expect(leftArmor.userData.facesWarTable).toBe(true);
    expect(rightArmor.userData.facesWarTable).toBe(true);
    expect(leftConsole.visible).toBe(false);
    expect(rightConsole.visible).toBe(false);
    expect(leftConsole.userData.warRoomFurniturePlacement).toBe('retired-duplicate-side-table-v28');
    expect(rightConsole.userData.warRoomFurniturePlacement).toBe('retired-duplicate-side-table-v28');
    expect(Math.abs(leftArmor.position.x)).toBeGreaterThan(Math.abs(leftConsole.position.x));
    expect(Math.abs(rightArmor.position.x)).toBeGreaterThan(Math.abs(rightConsole.position.x));
    expect(Math.abs(leftArmor.rotation.y)).toBeGreaterThan(1.3);
    expect(Math.abs(rightArmor.rotation.y)).toBeGreaterThan(1.3);
    expect(mortarJoints.length).toBeGreaterThan(10);
    expect(mortarJoints.every((joint) => joint.visible === false)).toBe(true);
    expect(owner.userData.warRoomRetiredMortarJoints).toBe(mortarJoints.length);

    const diagonalBraces = [];
    room.traverse((object) => {
      if (['war-room-hammerbeam-brace', 'war-room-armor-alcove-pointed-arch'].includes(object.name)) diagonalBraces.push(object);
    });
    expect(diagonalBraces.every((brace) => brace.visible === false)).toBe(true);
    expect(room.getObjectByName('war-room-hammerbeam-side-tie').visible).toBe(false);
    expect(room.getObjectByName('war-room-armor-alcove-left').visible).toBe(false);
    expect(room.getObjectByName('war-room-armor-alcove-right').visible).toBe(false);
    expect(room.getObjectByName('war-room-gallery-picture-rail').visible).toBe(false);
    expect(room.getObjectByName('war-room-gallery-picture-rail-brass-line').visible).toBe(false);

    dispose(room);
  });

  it('da a cada cuadro un paisaje premium diferente y conserva el acabado físico del lienzo', () => {
    const room = buildPremiumWarRoomLayer(theme, true, false);
    const left = room.getObjectByName('war-room-premium-painting-0');
    const right = room.getObjectByName('war-room-premium-painting-1');
    const leftCanvas = left.getObjectByName('war-room-premium-painting-canvas');
    const rightCanvas = right.getObjectByName('war-room-premium-painting-canvas');

    expect(left.userData.warRoomLandscapeVersion).toBe('v20');
    expect(right.userData.warRoomLandscapeVersion).toBe('v20');
    expect(left.userData.warRoomLandscapeSubject).toBe('black-forest-lake-dusk-v20');
    expect(right.userData.warRoomLandscapeSubject).toBe('north-sea-cliffs-v20');
    expect(left.userData.warRoomLandscapeSubject).not.toBe(right.userData.warRoomLandscapeSubject);
    expect(leftCanvas.material.map.name).toBe('war-room-gallery-black-forest-v20');
    expect(rightCanvas.material.map.name).toBe('war-room-gallery-north-sea-v20');
    expect(leftCanvas.material.map.userData.resolution).toEqual([384, 240]);
    expect(rightCanvas.material.map.userData.resolution).toEqual([384, 240]);
    expect(leftCanvas.material.map.userData.warRoomGalleryFinish).toBe('layered-canvas-v20');
    expect(rightCanvas.material.map.userData.warRoomGalleryFinish).toBe('layered-canvas-v20');
    expect(leftCanvas.material.roughnessMap?.userData?.warRoomPremiumSurface).toBe('canvas');
    expect(rightCanvas.material.roughnessMap?.userData?.warRoomPremiumSurface).toBe('canvas');

    dispose(room);
  });

  it('reviste el interior de la chimenea con ladrillo refractario ennegrecido al montar la sala completa', () => {
    const room = buildPremiumWarRoomLayer(theme, false, false);
    runRootDriver(room);
    const fireplace = room.getObjectByName('war-room-fireplace');
    const names = [
      'war-room-fireplace-refractory-back',
      'war-room-fireplace-refractory-hearth',
      'war-room-fireplace-refractory-return-left',
      'war-room-fireplace-refractory-return-right',
    ];

    expect(room.userData.warRoomCompositionPolishVersion).toBe('v10');
    expect(fireplace.userData.warRoomInteriorFinish).toBe('refractory-v4');
    expect(fireplace.userData.warRoomUserFireplaceFinish).toBe('v20');
    expect(fireplace.userData.warRoomFirebrickPalette).toBe('red-black-sooted-v20');
    expect(fireplace.userData.warRoomFirebrickBackFlush).toBe(true);
    expect(fireplace.userData.warRoomInteriorMeshCount).toBe(4);
    for (const name of names) {
      const mesh = fireplace.getObjectByName(name);
      expect(mesh).toBeInstanceOf(THREE.Mesh);
      expect(mesh.castShadow).toBe(false);
      expect(mesh.material.map.userData.warRoomFireplaceTexture).toBe('sooted-refractory-brick-v4');
      expect(mesh.material.map.userData.resolution).toEqual([96, 96]);
    }
    const fireLights = [];
    fireplace.traverse((object) => {
      if (object instanceof THREE.Light) fireLights.push(object);
    });
    expect(fireLights).toHaveLength(1);

    dispose(room);
  });

  it('es idempotente y no añade el pass pesado en coarse/mobile', () => {
    const desktop = buildPremiumWarRoomLayer(theme, true, false);
    const mobile = buildPremiumWarRoomLayer(theme, true, true);
    const owner = compositionOwner(desktop);

    expect(owner).toBeTruthy();
    expect(applyWarRoomCompositionPolish(owner, { wallZ: -7.6, towardBoard: 1, coarsePointer: false })).toBe(0);
    runRootDriver(desktop);
    expect(applyWarRoomCompositionPolish(desktop, { wallZ: -7.6, towardBoard: 1, coarsePointer: false })).toBe(0);
    expect(mobile.userData.warRoomCompositionPolishVersion).toBeUndefined();
    expect(mobile.getObjectByName('war-room-fireplace-refractory-back')).toBeUndefined();

    dispose(desktop);
    dispose(mobile);
  });
});