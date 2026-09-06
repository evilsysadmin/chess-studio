import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  HANS_FIREPLACE_ODDS,
  HANS_FIREPLACE_START_DELAY_S,
  hansFireplaceFrame,
  installWarRoomHansFireplaceRoutine,
  shouldScheduleHansFireplace,
  writeHansFireplaceFrame,
} from './WarRoomHansFireplace.js';

function makeRoom(x = -4.95) {
  const room = new THREE.Group();
  const fireplace = new THREE.Group();
  fireplace.name = 'war-room-fireplace';
  fireplace.position.x = x;
  const fireCore = new THREE.Group();
  fireCore.name = 'war-room-fire-core';
  fireCore.add(new THREE.Mesh(
    new THREE.ConeGeometry(0.2, 0.5, 8),
    new THREE.MeshPhysicalMaterial({ color: 0xff7a18, emissive: 0xff2200, emissiveIntensity: 2 }),
  ));
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

  it('deja siempre capazo, leña y herramientas junto a la chimenea', () => {
    const left = makeRoom(-4.95);
    const right = makeRoom(4.95);

    for (const room of [left, right]) {
      expect(installWarRoomHansFireplaceRoutine(room, {
        towardBoard: 1,
        randomValue: 0.7,
        reducedMotion: false,
      })).toBe(2);
      const fireplace = room.getObjectByName('war-room-fireplace');
      const basket = room.getObjectByName('war-room-hearth-log-basket');
      const tools = room.getObjectByName('war-room-hearth-tool-stand');
      const hans = room.getObjectByName('war-room-hans-butler');
      const driver = room.getObjectByName('war-room-hans-fireplace-driver');

      expect(basket).toBeTruthy();
      expect(tools).toBeTruthy();
      expect(room.getObjectByName('war-room-hearth-poker')).toBeTruthy();
      expect(room.getObjectByName('war-room-hearth-shovel')).toBeTruthy();
      expect(room.getObjectByName('war-room-hearth-tongs')).toBeTruthy();
      expect(room.getObjectByName('war-room-hans-hearth-added-log').visible).toBe(false);
      expect(Math.sign(basket.position.x)).toBe(Math.sign(fireplace.position.x));
      expect(Math.sign(tools.position.x)).toBe(Math.sign(fireplace.position.x));
      expect(hans.userData.warRoomCharacter).toBe('Hans');
      expect(hans.visible).toBe(false);
      expect(driver.userData.warRoomHansSelected).toBe(false);
      expect(driver.userData.warRoomHansPhase).toBe('not-selected');
      expect(typeof driver.onBeforeRender).toBe('function');
      expect(driver.renderOrder).toBeGreaterThanOrEqual(1000);
    }

    dispose(left);
    dispose(right);
  });

  it('apaga la chimenea, hace entrar a Hans, añade un tronco y aviva el fuego', () => {
    expect(hansFireplaceFrame(HANS_FIREPLACE_START_DELAY_S - 0.01).phase).toBe('waiting');

    const dim = hansFireplaceFrame(HANS_FIREPLACE_START_DELAY_S + 4.9);
    expect(dim.phase).toBe('fire-dimming');
    expect(dim.fireScale).toBeLessThan(0.32);
    expect(dim.hansVisible).toBe(false);

    const arrive = hansFireplaceFrame(HANS_FIREPLACE_START_DELAY_S + 7.5);
    expect(arrive.phase).toBe('walk-to-basket');
    expect(arrive.hansVisible).toBe(true);
    expect(arrive.fireScale).toBeCloseTo(0.26, 2);

    const takeLog = hansFireplaceFrame(HANS_FIREPLACE_START_DELAY_S + 11.6);
    expect(takeLog.phase).toBe('take-log');
    expect(takeLog.carryLog).toBe(true);
    expect(takeLog.removeBasketLog).toBe(true);

    const placed = hansFireplaceFrame(HANS_FIREPLACE_START_DELAY_S + 16.8);
    expect(placed.phase).toBe('place-log');
    expect(placed.showAddedLog).toBe(true);

    const stoke = hansFireplaceFrame(HANS_FIREPLACE_START_DELAY_S + 22.5);
    expect(stoke.phase).toBe('stoke-fire');
    expect(stoke.carryPoker).toBe(true);
    expect(stoke.fireScale).toBeGreaterThan(0.6);

    const nod = hansFireplaceFrame(HANS_FIREPLACE_START_DELAY_S + 26.2);
    expect(nod.phase).toBe('satisfied');
    expect(nod.fireScale).toBe(1);
    expect(nod.headNod).toBeGreaterThan(0);

    const complete = hansFireplaceFrame(HANS_FIREPLACE_START_DELAY_S + 33.1);
    expect(complete.complete).toBe(true);
    expect(complete.hansVisible).toBe(false);
    expect(complete.fireScale).toBe(1);
    expect(complete.removeBasketLog).toBe(true);
    expect(complete.showAddedLog).toBe(true);
  });

  it('reutiliza un único frame scratch sin arrastrar estado de la fase anterior', () => {
    const scratch = {};
    const takeLog = writeHansFireplaceFrame(scratch, HANS_FIREPLACE_START_DELAY_S + 11.6);
    expect(takeLog).toBe(scratch);
    expect({ ...takeLog }).toEqual(hansFireplaceFrame(HANS_FIREPLACE_START_DELAY_S + 11.6));
    expect(takeLog.carryLog).toBe(true);

    const complete = writeHansFireplaceFrame(scratch, HANS_FIREPLACE_START_DELAY_S + 33.1);
    expect(complete).toBe(scratch);
    expect({ ...complete }).toEqual(hansFireplaceFrame(HANS_FIREPLACE_START_DELAY_S + 33.1));
    expect(complete.carryLog).toBe(false);
    expect(complete.complete).toBe(true);

    const waiting = writeHansFireplaceFrame(scratch, HANS_FIREPLACE_START_DELAY_S - 0.01);
    expect(waiting).toBe(scratch);
    expect({ ...waiting }).toEqual(hansFireplaceFrame(HANS_FIREPLACE_START_DELAY_S - 0.01));
    expect(waiting.complete).toBe(false);
    expect(waiting.removeBasketLog).toBe(false);
  });

  it('arma el cameo forzado sin depender del azar y conserva geometría determinista', () => {
    const ordinary = makeRoom();
    const cameo = makeRoom();
    installWarRoomHansFireplaceRoutine(ordinary, { towardBoard: 1, randomValue: 0.7, reducedMotion: false });
    installWarRoomHansFireplaceRoutine(cameo, { towardBoard: 1, forceEvent: true, reducedMotion: false });

    const ordinaryHans = ordinary.getObjectByName('war-room-hans-butler');
    const cameoHans = cameo.getObjectByName('war-room-hans-butler');
    expect(ordinaryHans).toBeTruthy();
    expect(cameoHans).toBeTruthy();
    expect(ordinaryHans.visible).toBe(false);
    expect(cameoHans.visible).toBe(false);
    expect(ordinary.getObjectByName('war-room-hans-fireplace-driver').userData.warRoomHansSelected).toBe(false);
    expect(cameo.getObjectByName('war-room-hans-fireplace-driver').userData.warRoomHansSelected).toBe(true);
    expect(cameo.getObjectByName('war-room-fireplace').userData.warRoomHansEventSelected).toBe(true);

    dispose(ordinary);
    dispose(cameo);
  });

  it('en móvil conserva el decorado pero no carga ni anima a Hans', () => {
    const room = makeRoom();
    expect(installWarRoomHansFireplaceRoutine(room, {
      towardBoard: 1,
      coarsePointer: true,
      forceEvent: true,
      reducedMotion: false,
    })).toBe(1);
    expect(room.getObjectByName('war-room-hearth-log-basket')).toBeTruthy();
    expect(room.getObjectByName('war-room-hearth-tool-stand')).toBeTruthy();
    expect(room.getObjectByName('war-room-hans-butler')).toBeFalsy();
    expect(room.getObjectByName('war-room-hans-fireplace-driver')).toBeFalsy();
    dispose(room);
  });

  it('reduced motion deja a Hans cargado pero desarmado', () => {
    const room = makeRoom();
    expect(installWarRoomHansFireplaceRoutine(room, {
      towardBoard: 1,
      forceEvent: true,
      reducedMotion: true,
    })).toBe(2);
    expect(room.getObjectByName('war-room-hans-butler')).toBeTruthy();
    expect(room.getObjectByName('war-room-hans-fireplace-driver').userData.warRoomHansPhase).toBe('reduced-motion');
    expect(room.getObjectByName('war-room-fireplace').userData.warRoomHansEventSelected).toBe(false);
    dispose(room);
  });
});
