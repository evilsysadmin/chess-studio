import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  advanceWarRoomHansWalk,
  applyWarRoomHansTaskPose,
  createWarRoomHansPoseBaseline,
  createWarRoomHansWalkController,
  moveWarRoomHansToward,
  placeWarRoomHansHorizontal,
  resetWarRoomHansTaskPose,
  resetWarRoomHansWalk,
  WAR_ROOM_HANS_ANIMATOR_VERSION,
  WAR_ROOM_HANS_GAIT_OWNER,
  WAR_ROOM_HANS_POSE_BASELINE_VERSION,
} from './WarRoomHansAnimator.js';

describe('War Room Hans animator', () => {
  it('owns horizontal locomotion without overriding rendered grounding', () => {
    const hans = new THREE.Group();
    hans.position.set(4, -0.612, 4);
    const target = new THREE.Vector3(1, -0.34, 1);
    const groundedY = hans.position.y;

    const motion = moveWarRoomHansToward(hans, target, 0.5);

    expect(WAR_ROOM_HANS_ANIMATOR_VERSION).toContain('single-gait');
    expect(WAR_ROOM_HANS_ANIMATOR_VERSION).toContain('pose-baseline');
    expect(motion.blocked).toBe(false);
    expect(motion.travelled).toBeCloseTo(0.5, 6);
    expect(hans.position.x).toBeLessThan(4);
    expect(hans.position.z).toBeLessThan(4);
    expect(hans.position.y).toBeCloseTo(groundedY, 6);
  });

  it('delegates task walking to the single articulated gait owner without mutating limbs', () => {
    const leftLeg = new THREE.Group();
    const rightLeg = new THREE.Group();
    const torso = new THREE.Group();
    leftLeg.rotation.x = 0.31;
    rightLeg.rotation.x = -0.27;
    torso.rotation.x = 0.12;
    const controller = {
      body: { leftLeg, rightLeg, torso },
      warRoomHansDelegatedTravelDistance: 0,
    };

    expect(advanceWarRoomHansWalk(controller, { travelled: 0.42, horizontalWeight: 0.8 })).toBe(true);
    expect(leftLeg.rotation.x).toBeCloseTo(0.31, 6);
    expect(rightLeg.rotation.x).toBeCloseTo(-0.27, 6);
    expect(torso.rotation.x).toBeCloseTo(0.12, 6);
    expect(controller.warRoomHansDelegatedTravelDistance).toBeCloseTo(0.42, 6);
    expect(controller.warRoomHansGaitOwner).toBe(WAR_ROOM_HANS_GAIT_OWNER);
  });

  it('captures and restores task pose baselines without constructing a walk cycle', () => {
    const body = {};
    for (const key of [
      'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle', 'leftShoe', 'rightShoe',
      'leftLeg', 'rightLeg', 'torso', 'head', 'leftArm', 'rightArm', 'cane', 'tailcoat',
    ]) {
      body[key] = new THREE.Group();
      body[key].position.set(0.1, 0.2, 0.3);
      body[key].rotation.set(0.01, 0.02, 0.03);
    }
    const actor = { body };
    const baseline = createWarRoomHansPoseBaseline(actor);

    expect(baseline?.version).toBe(WAR_ROOM_HANS_POSE_BASELINE_VERSION);
    expect(baseline?.sample).toBeUndefined();
    expect(baseline?.lengths).toBeUndefined();

    for (const part of Object.values(body)) {
      part.position.y = 9;
      part.rotation.x = 7;
    }
    expect(resetWarRoomHansTaskPose(baseline, { full: true })).toBe(true);
    for (const part of Object.values(body)) {
      expect(part.position.y).toBeCloseTo(0.2, 6);
      expect(part.rotation.x).toBeCloseTo(0.01, 6);
    }

    const legacyAlias = createWarRoomHansWalkController(actor, { forward: -1 });
    expect(legacyAlias?.version).toBe(WAR_ROOM_HANS_POSE_BASELINE_VERSION);
    expect(legacyAlias?.forward).toBe(-1);
    body.leftArm.rotation.x = 2;
    expect(resetWarRoomHansWalk(legacyAlias, { full: true })).toBe(true);
    expect(body.leftArm.rotation.x).toBeCloseTo(0.01, 6);
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

  it('owns every ambient chore pose while chore tasks keep only world and prop animation', () => {
    const hans = new THREE.Group();
    const rightArm = new THREE.Group();
    const leftArm = new THREE.Group();
    const torso = new THREE.Group();
    const actor = { hans, body: { rightArm, leftArm, torso } };
    const reset = () => {
      rightArm.rotation.x = 0;
      leftArm.rotation.x = 0;
      torso.rotation.x = 0;
    };

    expect(applyWarRoomHansTaskPose(actor, 'dust-board', { elapsedMs: 0 })).toBe(true);
    expect(rightArm.rotation.x).toBeCloseTo(-0.62, 6);
    expect(torso.rotation.x).toBeCloseTo(0.025, 6);

    reset();
    expect(applyWarRoomHansTaskPose(actor, 'bring-book')).toBe(true);
    expect(leftArm.rotation.x).toBeCloseTo(-0.34, 6);
    expect(rightArm.rotation.x).toBeCloseTo(-0.34, 6);

    reset();
    expect(applyWarRoomHansTaskPose(actor, 'straighten-room')).toBe(true);
    expect(leftArm.rotation.x).toBeCloseTo(-0.48, 6);
    expect(rightArm.rotation.x).toBeCloseTo(-0.62, 6);

    reset();
    expect(applyWarRoomHansTaskPose(actor, 'sweep-ashes', { elapsedMs: 0 })).toBe(true);
    expect(rightArm.rotation.x).toBeCloseTo(-0.72, 6);
    expect(torso.rotation.x).toBeCloseTo(0.06, 6);

    reset();
    expect(applyWarRoomHansTaskPose(actor, 'polish-brass', { elapsedMs: 0 })).toBe(true);
    expect(rightArm.rotation.x).toBeCloseTo(-0.55, 6);
    expect(leftArm.rotation.x).toBeCloseTo(-0.18, 6);
    expect(hans.userData.warRoomHansTaskPose).toBe('polish-brass');
  });

  it('owns the mop posture so the mop task animates props, not Hans limbs', () => {
    const hans = new THREE.Group();
    const rightArm = new THREE.Group();
    const leftArm = new THREE.Group();
    const torso = new THREE.Group();
    const actor = { hans, body: { rightArm, leftArm, torso } };

    expect(applyWarRoomHansTaskPose(actor, 'mop')).toBe(true);
    expect(leftArm.rotation.x).toBeCloseTo(-0.52, 6);
    expect(rightArm.rotation.x).toBeCloseTo(-0.72, 6);
    expect(torso.rotation.x).toBeCloseTo(0.04, 6);
    expect(hans.userData.warRoomHansTaskPose).toBe('mop');
  });
});
