import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  applyWarRoomHansArmorPolishPose,
  rigWarRoomHansPolishCloth,
  WAR_ROOM_HANS_ARMOR_POLISH_GUARD_VERSION,
} from './WarRoomHansArmorPolishGuard.js';

describe('WarRoomHansArmorPolishGuard', () => {
  it('rigs the polishing cloth to Hans right hand instead of leaving it floating on the actor root', () => {
    const hans = new THREE.Group();
    const rightArm = new THREE.Group();
    hans.add(rightArm);
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.025, 0.18), new THREE.MeshBasicMaterial());
    hans.add(cloth);
    const actor = { hans, body: { rightArm } };

    expect(rigWarRoomHansPolishCloth(actor, cloth)).toBe(true);
    expect(cloth.parent).toBe(rightArm);
    expect(cloth.position.x).toBeCloseTo(0.055, 6);
    expect(cloth.position.y).toBeCloseTo(-0.62, 6);
    expect(cloth.userData.warRoomHansClothRig).toBe(WAR_ROOM_HANS_ARMOR_POLISH_GUARD_VERSION);
    expect(cloth.userData.warRoomHansClothHand).toBe('right');
  });

  it('adds a visible polishing loop while keeping the cloth attached to the working arm', () => {
    const hans = new THREE.Group();
    const rightArm = new THREE.Group();
    const leftArm = new THREE.Group();
    const torso = new THREE.Group();
    const head = new THREE.Group();
    hans.add(rightArm, leftArm, torso, head);
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.025, 0.18), new THREE.MeshBasicMaterial());
    rightArm.add(cloth);
    const actor = { hans, body: { rightArm, leftArm, torso, head } };

    expect(applyWarRoomHansArmorPolishPose(actor, cloth, 0)).toBe(true);
    expect(rightArm.rotation.x).toBeCloseTo(-0.1, 6);
    expect(rightArm.rotation.y).toBeCloseTo(0.16, 6);
    expect(leftArm.rotation.x).toBeCloseTo(-0.1, 6);
    expect(torso.rotation.x).toBeCloseTo(0.018, 6);
    expect(head.rotation.x).toBeCloseTo(0.045, 6);
    expect(hans.userData.warRoomHansTaskPose).toBe('polish-armor');

    const firstZ = rightArm.rotation.z;
    rightArm.rotation.set(0, 0, 0);
    cloth.rotation.z = 0;
    expect(applyWarRoomHansArmorPolishPose(actor, cloth, 185)).toBe(true);
    expect(Math.abs(rightArm.rotation.z - firstZ)).toBeGreaterThan(0.1);
    expect(cloth.rotation.z).not.toBeCloseTo(0.18, 3);
  });
});
