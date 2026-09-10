import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  WAR_ROOM_CAT_AMBIENT_VERSION,
  WAR_ROOM_CAT_APPEARANCE_CHANCE,
  WAR_ROOM_CAT_ROUTINES,
  applyWarRoomCatAmbient,
  getWarRoomCatAmbientState,
  installWarRoomCatAmbient,
} from './WarRoomCatAmbient.js';

function room({ mirrored = false } = {}) {
  const root = new THREE.Group();
  const fireplace = new THREE.Group();
  fireplace.name = 'war-room-fireplace';
  fireplace.position.set(-4.95, 0, mirrored ? 6.67 : -6.67);
  root.add(fireplace);

  for (const [name, x] of [['war-room-sofa-left', -6.55], ['war-room-sofa-right', 6.55]]) {
    const sofa = new THREE.Group();
    sofa.name = name;
    sofa.position.set(x, 0.02, mirrored ? -4.95 : 4.95);
    root.add(sofa);
  }
  return root;
}

function sequence(...values) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

describe('War Room cat ambient life', () => {
  it('appears only on a restrained per-visit probability and never rerolls on the same scene', () => {
    const absent = room();
    expect(WAR_ROOM_CAT_APPEARANCE_CHANCE).toBeCloseTo(0.28, 5);
    expect(installWarRoomCatAmbient(absent, { random: () => 0.9 })).toBe(0);
    expect(absent.userData.warRoomCatPresent).toBe(false);
    expect(absent.getObjectByName('war-room-cat')).toBeFalsy();
    expect(installWarRoomCatAmbient(absent, { random: () => 0 })).toBe(0);
    expect(absent.getObjectByName('war-room-cat')).toBeFalsy();

    const present = room();
    expect(installWarRoomCatAmbient(present, { random: sequence(0.1, 0.1, 0.8), now: 1000 })).toBe(1);
    expect(present.userData.warRoomCatAmbient).toBe(WAR_ROOM_CAT_AMBIENT_VERSION);
    expect(present.userData.warRoomCatPresent).toBe(true);
    expect(present.getObjectByName('war-room-cat')).toBeTruthy();
    const cat = present.getObjectByName('war-room-cat');
    expect(installWarRoomCatAmbient(present, { random: () => 1, now: 5000 })).toBe(0);
    expect(present.getObjectByName('war-room-cat')).toBe(cat);
  });

  it('selects the three ambient routines without adding lights', () => {
    const rolls = [
      [0.1, 'observer'],
      [0.5, 'sofa-sleeper'],
      [0.9, 'groomer'],
    ];
    expect(WAR_ROOM_CAT_ROUTINES).toEqual(['observer', 'sofa-sleeper', 'groomer']);

    for (const [routineRoll, expected] of rolls) {
      const root = room();
      installWarRoomCatAmbient(root, { random: sequence(0.05, routineRoll, 0.8), now: 0 });
      expect(root.userData.warRoomCatRoutine).toBe(expected);
      let lights = 0;
      root.getObjectByName('war-room-cat').traverse((object) => {
        if (object.isLight) lights += 1;
      });
      expect(lights).toBe(0);
    }
  });

  it('walks to the board, watches pieces, then sleeps on the foreground sofa', () => {
    const root = room();
    installWarRoomCatAmbient(root, { random: sequence(0.05, 0.5, 0.8), now: 1000 });
    const cat = root.getObjectByName('war-room-cat');

    applyWarRoomCatAmbient(root, { now: 4000, reducedMotion: false });
    expect(root.userData.warRoomCatBehavior).toBe('walking-to-board');
    const walkingZ = cat.position.z;

    applyWarRoomCatAmbient(root, { now: 11_000, reducedMotion: false });
    expect(root.userData.warRoomCatBehavior).toBe('watching-pieces');
    expect(cat.position.z).toBeLessThan(walkingZ);

    applyWarRoomCatAmbient(root, { now: 36_000, reducedMotion: false });
    expect(root.userData.warRoomCatBehavior).toBe('sleeping-on-sofa');
    expect(cat.position.x).toBeCloseTo(6.43, 2);
    expect(cat.position.y).toBeCloseTo(0.6, 2);
    expect(cat.position.z).toBeCloseTo(4.9, 2);
    const leftEye = cat.getObjectByName('war-room-cat-eye-left');
    expect(leftEye.scale.y).toBeLessThan(0.1);
  });

  it('mirrors its route with the War Room orientation and keeps to the board edge', () => {
    const root = room({ mirrored: true });
    installWarRoomCatAmbient(root, { random: sequence(0.05, 0.1, 0.2), now: 0 });
    const cat = root.getObjectByName('war-room-cat');

    applyWarRoomCatAmbient(root, { now: 10_000, reducedMotion: false });
    const state = getWarRoomCatAmbientState(root);
    expect(state.routine).toBe('observer');
    expect(state.side).toBe(-1);
    expect(cat.position.x).toBeLessThan(-4);
    expect(cat.position.z).toBeLessThan(-1);
    expect(Math.abs(cat.position.x)).toBeGreaterThan(4.5);
  });

  it('respects reduced motion by settling into a static watch pose', () => {
    const root = room();
    installWarRoomCatAmbient(root, { random: sequence(0.05, 0.9, 0.8), now: 0 });
    const cat = root.getObjectByName('war-room-cat');

    expect(applyWarRoomCatAmbient(root, { now: 8000, reducedMotion: true })).toBe(1);
    expect(root.userData.warRoomCatBehavior).toBe('quietly-watching-pieces');
    const position = cat.position.clone();
    const rotation = cat.rotation.clone();
    applyWarRoomCatAmbient(root, { now: 18_000, reducedMotion: true });
    expect(cat.position.distanceTo(position)).toBeCloseTo(0, 8);
    expect(cat.rotation.x).toBeCloseTo(rotation.x, 8);
    expect(cat.rotation.y).toBeCloseTo(rotation.y, 8);
    expect(cat.rotation.z).toBeCloseTo(rotation.z, 8);
  });
});
