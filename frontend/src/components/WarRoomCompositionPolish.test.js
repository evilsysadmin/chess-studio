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

  it('separa las armaduras de las consolas y retira las juntas que dibujaban M accidentales', () => {
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
    expect(leftArmor.userData.warRoomArmorPlacement).toBe('floor-sentry-facing-board-v16');
    expect(rightArmor.userData.warRoomArmorPlacement).toBe('floor-sentry-facing-board-v16');
    expect(leftArmor.userData.facesWarTable).toBe(true);
    expect(rightArmor.userData.facesWarTable).toBe(true);
    expect(Math.abs(leftArmor.position.x)).toBeGreaterThan(Math.abs(leftConsole.position.x) + 0.2);
    expect(Math.abs(rightArmor.position.x)).toBeGreaterThan(Math.abs(rightConsole.position.x) + 0.2);
    expect(Math.abs(leftArmor.rotation.y)).toBeGreaterThan(0.6);
    expect(Math.abs(rightArmor.rotation.y)).toBeGreaterThan(0.6);
    expect(mortarJoints.length).toBeGreaterThan(10);
    expect(mortarJoints.every((joint) => joint.visible === false)).toBe(true);
    expect(owner.userData.warRoomRetiredMortarJoints).toBe(mortarJoints.length);

    dispose(room);
  });

  it('da a cada cuadro un paisaje premium diferente y conserva el acabado físico del lienzo', () => {
    const room = buildPremiumWarRoomLayer(theme, true, false);
    const left = room.getObjectByName('war-room-premium-painting-0');
    const right = room.getObjectByName('war-room-premium-painting-1');
    const leftCanvas = left.getObjectByName('war-room-premium-painting-canvas');
    const rightCanvas = right.getObjectByName('war-room-premium-painting-canvas');

    expect(left.userData.warRoomLandscapeVersion).toBe('v16');
    expect(right.userData.warRoomLandscapeVersion).toBe('v16');
    expect(left.userData.warRoomLandscapeSubject).toBe('rhine-valley-castle-v16');
    expect(right.userData.warRoomLandscapeSubject).toBe('alpine-lake-fortress-v16');
    expect(left.userData.warRoomLandscapeSubject).not.toBe(right.userData.warRoomLandscapeSubject);
    expect(leftCanvas.material.map.name).toBe('war-room-gallery-rhine-landscape-v16');
    expect(rightCanvas.material.map.name).toBe('war-room-gallery-alpine-landscape-v16');
    expect(leftCanvas.material.map.userData.resolution).toEqual([256, 160]);
    expect(rightCanvas.material.map.userData.resolution).toEqual([256, 160]);
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
    expect(fireplace.userData.warRoomUserFireplaceFinish).toBe('v16');
    expect(fireplace.userData.warRoomFirebrickPalette).toBe('red-black-sooted-v16');
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
