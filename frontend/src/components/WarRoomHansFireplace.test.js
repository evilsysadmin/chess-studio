import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  HANS_FIREPLACE_ODDS,
  HANS_FIREPLACE_START_DELAY_S,
  hansFireplaceFrame,
  installWarRoomHansFireplaceRoutine,
  shouldScheduleHansFireplace,
} from './WarRoomHansFireplace.js';

function makeRoom() {
  const room = new THREE.Group();
  const fireplace = new THREE.Group();
  fireplace.name = 'war-room-fireplace';
  const fireCore = new THREE.Group();
  fireCore.name = 'war-room-fire-core';
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.2, 0.5, 8),
    new THREE.MeshPhysicalMaterial({ color: 0xff7a18, emissive: 0xff2200, emissiveIntensity: 2 }),
  );
  fireCore.add(flame);
  const light = new THREE.PointLight(0xff8738, 5.2, 8.8, 2);
  light.name = 'war-room-fire-light';
  light.userData.baseWarRoomIntensity = 5.2;
  fireplace.add(fireCore, light);
  room.add(fireplace);
  return room;
}

function dispose(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse((object) => {
    if (object.geometry && !geometries.has(object.geometry)) {
      geometries.add(object.geometry);
      object.geometry.dispose?.();
    }
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) {
      if (!material || materials.has(material)) continue;
      materials.add(material);
      material.dispose?.();
    }
  });
}

describe('Hans fireplace caretaker', () => {
  it('mantiene el cameo raro en una de cada diez salas elegibles', () => {
    expect(HANS_FIREPLACE_ODDS).toBe(10);
    expect(shouldScheduleHansFireplace(0)).toBe(true);
    expect(shouldScheduleHansFireplace(0.0999)).toBe(true);
    expect(shouldScheduleHansFireplace(0.1)).toBe(false);
    expect(shouldScheduleHansFireplace(0.88)).toBe(false);
  });

  it('instala siempre el capazo y las herramientas, pero Hans solo cuando toca', () => {
    const ordinary = makeRoom();
    expect(installWarRoomHansFireplaceRoutine(ordinary, {
      towardBoard: 1,
      randomValue: 0.7,
      reducedMotion: false,
    })).toBe(1);
    expect(ordinary.getObjectByName('war-room-hearth-log-basket')).toBeTruthy();
    expect(ordinary.getObjectByName('war-room-hearth-tool-stand')).toBeTruthy();
    expect(ordinary.getObjectByName('war-room-hearth-poker')).toBeTruthy();
    expect(ordinary.getObjectByName('war-room-hans-butler')).toBeFalsy();
    expect(ordinary.getObjectByName('war-room-fireplace').userData.warRoomHansEventSelected).toBe(false);

    const cameo = makeRoom();
    expect(installWarRoomHansFireplaceRoutine(cameo, {
      towardBoard: -1,
      forceEvent: true,
      reducedMotion: false,
    })).toBe(2);
    const hans = cameo.getObjectByName('war-room-hans-butler');
    const driver = cameo.getObjectByName('war-room-hans-fireplace-driver');
    expect(hans).toBeTruthy();
    expect(hans.visible).toBe(false);
    expect(hans.userData.warRoomCharacter).toBe('Hans');
    expect(driver).toBeInstanceOf(THREE.Mesh);
    expect(typeof driver.onBeforeRender).toBe('function');
    expect(driver.renderOrder).toBeGreaterThanOrEqual(1000);
    expect(cameo.getObjectByName('war-room-fireplace').userData.warRoomHansEventSelected).toBe(true);

    dispose(ordinary);
    dispose(cameo);
  });

  it('apaga la chimenea, hace entrar a Hans con leña y atizador y recupera el fuego', () => {
    expect(hansFireplaceFrame(HANS_FIREPLACE_START_DELAY_S - 0.01).phase).toBe('waiting');

    const dim = hansFireplaceFrame(HANS_FIREPLACE_START_DELAY_S + 4.9);
    expect(dim.phase).toBe('fire-dimming');
    expect(dim.fireScale).toBeLessThan(0.35);
    expect(dim.hansVisible).toBe(false);

    const arrive = hansFireplaceFrame(HANS_FIREPLACE_START_DELAY_S + 7.5);
    expect(arrive.phase).toBe('walk-to-basket');
    expect(arrive.hansVisible).toBe(true);
    expect(arrive.fireScale).toBeCloseTo(0.28, 2);

    const log = hansFireplaceFrame(HANS_FIREPLACE_START_DELAY_S + 11.6);
    expect(log.phase).toBe('take-log');
    expect(log.carryLog).toBe(true);
    expect(log.removeBasketLog).toBe(true);

    const stoke = hansFireplaceFrame(HANS_FIREPLACE_START_DELAY_S + 22);
    expect(stoke.phase).toBe('stoke-fire');
    expect(stoke.carryPoker).toBe(true);
    expect(stoke.fireScale).toBeGreaterThan(0.5);

    const restored = hansFireplaceFrame(HANS_FIREPLACE_START_DELAY_S + 25.5);
    expect(restored.phase).toBe('satisfied');
    expect(restored.fireScale).toBeGreaterThanOrEqual(1);

    const complete = hansFireplaceFrame(HANS_FIREPLACE_START_DELAY_S + 32.1);
    expect(complete.complete).toBe(true);
    expect(complete.hansVisible).toBe(false);
    expect(complete.fireScale).toBe(1);
    expect(complete.removeBasketLog).toBe(true);
  });

  it('no anima el cameo en coarse pointer o reduced motion, pero conserva el decorado', () => {
    for (const options of [
      { coarsePointer: true, forceEvent: true, reducedMotion: false },
      { coarsePointer: false, forceEvent: true, reducedMotion: true },
    ]) {
      const room = makeRoom();
      expect(installWarRoomHansFireplaceRoutine(room, { towardBoard: 1, ...options })).toBe(1);
      expect(room.getObjectByName('war-room-hearth-log-basket')).toBeTruthy();
      expect(room.getObjectByName('war-room-hearth-tool-stand')).toBeTruthy();
      expect(room.getObjectByName('war-room-hans-butler')).toBeFalsy();
      dispose(room);
    }
  });
});
