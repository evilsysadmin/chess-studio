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

    expect(leftArmor.userData.warRoomArmorPlacement).toBe('outer-wall-sentry-v10');
    expect(rightArmor.userData.warRoomArmorPlacement).toBe('outer-wall-sentry-v10');
    expect(Math.abs(leftArmor.position.x)).toBeGreaterThan(Math.abs(leftConsole.position.x) + 0.2);
    expect(Math.abs(rightArmor.position.x)).toBeGreaterThan(Math.abs(rightConsole.position.x) + 0.2);
    expect(Math.abs(leftArmor.rotation.y)).toBeGreaterThan(0.15);
    expect(Math.abs(rightArmor.rotation.y)).toBeGreaterThan(0.15);
    expect(mortarJoints.length).toBeGreaterThan(10);
    expect(mortarJoints.every((joint) => joint.visible === false)).toBe(true);
    expect(room.userData.warRoomRetiredMortarJoints).toBe(mortarJoints.length);

    dispose(room);
  });

  it('da a cada cuadro un paisaje premium diferente y conserva el acabado físico del lienzo', () => {
    const room = buildPremiumWarRoomLayer(theme, true, false);
    const left = room.getObjectByName('war-room-premium-painting-0');
    const right = room.getObjectByName('war-room-premium-painting-1');
    const leftCanvas = left.getObjectByName('war-room-premium-painting-canvas');
    const rightCanvas = right.getObjectByName('war-room-premium-painting-canvas');

    expect(left.userData.warRoomGallerySubject).toBe('rhein-castle-river-dusk-v4');
    expect(right.userData.warRoomGallerySubject).toBe('alpine-fortress-moonstorm-v4');
    expect(left.userData.warRoomGallerySubject).not.toBe(right.userData.warRoomGallerySubject);
    expect(leftCanvas.material.map.name).toBe('war-room-gallery-rhein-dusk-v4');
    expect(rightCanvas.material.map.name).toBe('war-room-gallery-alpine-moonstorm-v4');
    expect(leftCanvas.material.map.userData.resolution).toEqual([192, 128]);
    expect(rightCanvas.material.map.userData.resolution).toEqual([192, 128]);
    expect(leftCanvas.material.roughnessMap?.userData?.warRoomPremiumSurface).toBe('canvas');
    expect(rightCanvas.material.roughnessMap?.userData?.warRoomPremiumSurface).toBe('canvas');

    dispose(room);
  });

  it('reviste el interior de la chimenea con ladrillo refractario ennegrecido sin luces nuevas', () => {
    const room = buildPremiumWarRoomLayer(theme, false, false);
    const fireplace = room.getObjectByName('war-room-fireplace');
    const names = [
      'war-room-fireplace-refractory-back',
      'war-room-fireplace-refractory-hearth',
      'war-room-fireplace-refractory-return-left',
      'war-room-fireplace-refractory-return-right',
    ];

    expect(fireplace.userData.warRoomInteriorFinish).toBe('refractory-v4');
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

    expect(desktop.userData.warRoomCompositionPolishVersion).toBe('v10');
    expect(applyWarRoomCompositionPolish(desktop, { wallZ: -7.6, towardBoard: 1, coarsePointer: false })).toBe(0);
    expect(mobile.userData.warRoomCompositionPolishVersion).toBeUndefined();
    expect(mobile.getObjectByName('war-room-fireplace-refractory-back')).toBeUndefined();

    dispose(desktop);
    dispose(mobile);
  });
});
