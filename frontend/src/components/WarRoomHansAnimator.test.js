import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  applyWarRoomHansTaskPose,
  moveWarRoomHansToward,
  placeWarRoomHansHorizontal,
  WAR_ROOM_HANS_ANIMATOR_VERSION,
} from './WarRoomHansAnimator.js';

describe('War Room Hans animator', () => {
  it('owns horizontal locomotion without overriding rendered grounding', () => {
    const hans = new THREE.Group();
    hans.position.set(4, -0.612, 4);
    const target = new THREE.Vector3(1, -0.34, 1);
    const groundedY = hans.position.y;

    const motion = moveWarRoomHansToward(hans, target, 0.5);

    expect(WAR_ROOM_HANS_ANIMATOR_VERSION).toContain('body-owner');
    expect(motion.blocked).toBe(false);
    expect(motion.travelled).toBeCloseTo(0.5, 6);
    expect(hans.position.x).toBeLessThan(4);
    expect(hans.position.z).toBeLessThan(4);
    expect(hans.position.y).toBeCloseTo(groundedY, 6);
  });

  it('owns service placement and anthropomorphic task poses without stealing Y', () => {
    const hans = new THREE.Group();
    hans.position.set(0, -0.713, 0);
    const rightArm = new THREE.Group();
    const leftArm = new THREE.Group();
    const torso = new THREE.Group();
    const actor = { hans, body: { rightArm, leftArm, torso } };
    const groundedY = hans.position.y;

    expect(placeWarRoomHansHorizontal(actor, new THREE.Vector3(2.5, 99, -1.25))).toBe(true);
    expect(hans.position.x).toBeCloseTo(2.5, 6);
    expect(hans.position.z).toBeCloseTo(-1.25, 6);
    expect(hans.position.y).toBeCloseTo(groundedY, 6);

    expect(applyWarRoomHansTaskPose(actor, 'water-plant')).toBe(true);
    expect(rightArm.rotation.x).toBeCloseTo(-0.58, 6);
    expect(torso.rotation.x).toBeCloseTo(0.035, 6);
    expect(hans.userData.warRoomHansTaskPose).toBe('water-plant');

    rightArm.rotation.x = 0;
    leftArm.rotation.x = 0;
    torso.rotation.x = 0;
    expect(applyWarRoomHansTaskPose(actor, 'espresso')).toBe(true);
    expect(rightArm.rotation.x).toBeCloseTo(-0.38, 6);
    expect(leftArm.rotation.x).toBeCloseTo(-0.38, 6);
    expect(torso.rotation.x).toBeCloseTo(0, 6);
    expect(hans.userData.warRoomHansTaskPose).toBe('espresso');
  });
});
