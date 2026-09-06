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
  const shoeMaterial = new THREE.MeshBasicMaterial();
  const leftShoe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.38), shoeMaterial);
  const rightShoe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.38), shoeMaterial);
  leftShoe.position.set(0, -0.74, -0.07);
  rightShoe.position.set(0, -0.74, -0.07);
  leftLeg.add(leftShoe);
  rightLeg.add(rightShoe);

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

  return { root, hans, driver, torso, head, leftShoe, rightShoe, carriedLog };
}

describe('Hans canonical elder-butler mock', () => {
  it('keeps the tailcoat and hunch, removes the cane and turns both shoe toes forward', () => {
    const { root, hans, torso, head, leftShoe, rightShoe } = makeRig();
    const baseHeadY = head.position.y;

    expect(leftShoe.position.z).toBeLessThan(0);
    expect(rightShoe.position.z).toBeLessThan(0);
    expect(installWarRoomHansCanonicalButler(root)).toBe(1);
    expect(hans.userData.warRoomHansCanonicalButler).toBe(WAR_ROOM_HANS_CANONICAL_BUTLER_VERSION);
    expect(hans.userData.warRoomHansCanonicalLook).toBe('black-tailcoat-elder-v2');
    expect(hans.userData.warRoomHansBaseHunchRadians).toBeGreaterThan(0.05);
    expect(torso.rotation.x).toBeGreaterThan(0.05);
    expect(head.position.y).toBeLessThan(baseHeadY);
    expect(torso.getObjectByName('war-room-hans-canonical-tailcoat')).toBeTruthy();
    expect(hans.getObjectByName('war-room-hans-cane')).toBeFalsy();
    expect(hans.userData.refs.cane).toBeUndefined();
    expect(hans.userData.refs.leftShoe).toBe(leftShoe);
    expect(hans.userData.refs.rightShoe).toBe(rightShoe);
    expect(leftShoe.position.z).toBeGreaterThan(0);
    expect(rightShoe.position.z).toBeGreaterThan(0);
    expect(leftShoe.userData.warRoomHansFootContract).toBe('toe-forward-v1');
    expect(rightShoe.userData.warRoomHansFootContract).toBe('toe-forward-v1');
    expect(hans.userData.warRoomHansFootDirection).toBe('toe-forward-v1');
    expect(hans.userData.refs.tailcoat?.name).toBe('war-room-hans-canonical-tailcoat');
    expect(installWarRoomHansCanonicalButler(root)).toBe(0);
  });

  it('keeps ElderWalk grounded without a cane while Hans can freely carry firewood', () => {
    const { root, hans, driver, carriedLog } = makeRig();

    expect(installWarRoomHansCanonicalButler(root)).toBe(1);
    expect(hans.userData.refs.cane).toBeUndefined();
    expect(installWarRoomHansElderWalk(root)).toBe(1);

    driver.onBeforeRender();
    driver.onBeforeRender();
    expect(hans.userData.warRoomHansGaitGrounding).toBe('real-distance-foot-plant-v3');

    carriedLog.visible = true;
    driver.onBeforeRender();
    expect(hans.userData.refs.cane).toBeUndefined();
    expect(hans.getObjectByName('war-room-hans-cane')).toBeFalsy();
  });

  it('removes a legacy cane already mounted by an older hot-reloaded scene', () => {
    const { root, hans } = makeRig();
    const legacyCane = new THREE.Group();
    legacyCane.name = 'war-room-hans-cane';
    hans.add(legacyCane);
    hans.userData.refs.cane = legacyCane;

    expect(installWarRoomHansCanonicalButler(root)).toBe(1);
    expect(hans.getObjectByName('war-room-hans-cane')).toBeFalsy();
    expect(hans.userData.refs.cane).toBeUndefined();
    expect(hans.userData.warRoomHansCane).toBeNull();
  });
});
