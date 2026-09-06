import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  installWarRoomHansCanonicalButler,
  WAR_ROOM_HANS_CANONICAL_BUTLER_VERSION,
} from './WarRoomHansCanonicalButler.js';
import { installWarRoomHansElderWalk } from './WarRoomHansElderWalk.js';

function makeRig() {
  const root = new THREE.Group();
  const hans = new THREE.Group();
  hans.name = 'war-room-hans-butler';
  hans.visible = true;
  hans.position.set(0, -0.34, 0.72);

  const part = (y = 0) => {
    const group = new THREE.Group();
    group.position.y = y;
    hans.add(group);
    return group;
  };

  const leftLeg = part(0.82);
  const rightLeg = part(0.82);
  const torso = part(1.36);
  const head = part(2.12);
  const leftArm = part(1.62);
  const rightArm = part(1.62);
  const carriedLog = part();
  const carriedPoker = part();
  carriedLog.position.z = 0.22;
  carriedPoker.position.z = 0.22;
  carriedLog.visible = false;
  carriedPoker.visible = false;

  hans.userData.refs = {
    leftLeg,
    rightLeg,
    torso,
    head,
    leftArm,
    rightArm,
    carriedLog,
    carriedPoker,
  };
  root.add(hans);

  const driver = new THREE.Group();
  driver.name = 'war-room-hans-fireplace-driver';
  let x = 0;
  driver.onBeforeRender = () => {
    x -= 0.05;
    hans.position.x = x;
    hans.userData.warRoomHansMotionState = 'walk';
  };
  root.add(driver);

  return { root, hans, driver, torso, head, carriedLog };
}

describe('Hans canonical elder-butler mock', () => {
  it('turns the live Three.js rig into the canonical tailcoat, cane and hunched silhouette', () => {
    const { root, hans, torso, head } = makeRig();
    const baseHeadY = head.position.y;

    expect(installWarRoomHansCanonicalButler(root)).toBe(1);
    expect(hans.userData.warRoomHansCanonicalButler).toBe(WAR_ROOM_HANS_CANONICAL_BUTLER_VERSION);
    expect(hans.userData.warRoomHansCanonicalLook).toBe('black-tailcoat-cane-elder-v1');
    expect(hans.userData.warRoomHansBaseHunchRadians).toBeGreaterThan(0.05);
    expect(torso.rotation.x).toBeGreaterThan(0.05);
    expect(head.position.y).toBeLessThan(baseHeadY);
    expect(torso.getObjectByName('war-room-hans-canonical-tailcoat')).toBeTruthy();
    expect(hans.getObjectByName('war-room-hans-cane')).toBeTruthy();
    expect(hans.userData.refs.cane?.name).toBe('war-room-hans-cane');
    expect(hans.userData.refs.tailcoat?.name).toBe('war-room-hans-canonical-tailcoat');
    expect(installWarRoomHansCanonicalButler(root)).toBe(0);
  });

  it('lets ElderWalk animate the cane while walking and stow it while Hans carries a log', () => {
    const { root, hans, driver, carriedLog } = makeRig();

    expect(installWarRoomHansCanonicalButler(root)).toBe(1);
    const cane = hans.userData.refs.cane;
    const baseCaneRotation = cane.rotation.x;
    expect(installWarRoomHansElderWalk(root)).toBe(1);

    driver.onBeforeRender();
    driver.onBeforeRender();
    expect(cane.visible).toBe(true);
    expect(cane.rotation.x).not.toBeCloseTo(baseCaneRotation, 6);
    expect(hans.userData.warRoomHansGaitGrounding).toBe('real-distance-foot-plant-v3');

    carriedLog.visible = true;
    driver.onBeforeRender();
    expect(cane.visible).toBe(false);
  });
});
