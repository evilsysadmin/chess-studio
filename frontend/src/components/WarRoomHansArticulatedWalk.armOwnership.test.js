import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  preserveWarRoomHansTaskArmPose,
  warRoomHansTaskHandsOccupied,
} from './WarRoomHansArticulatedWalk.js';

function makeFixture(propName, { visible = true, activeTask = 'service-espresso' } = {}) {
  const hans = new THREE.Group();
  hans.userData.warRoomHansActiveTask = activeTask;

  const leftArm = new THREE.Group();
  const rightArm = new THREE.Group();
  leftArm.rotation.set(-0.31, 0.08, -0.12);
  rightArm.rotation.set(-0.37, -0.06, 0.14);
  hans.add(leftArm, rightArm);

  const prop = new THREE.Group();
  prop.name = propName;
  prop.visible = visible;
  hans.add(prop);

  return { hans, body: { leftArm, rightArm }, prop };
}

function rotations(body) {
  return {
    left: [body.leftArm.rotation.x, body.leftArm.rotation.y, body.leftArm.rotation.z],
    right: [body.rightArm.rotation.x, body.rightArm.rotation.y, body.rightArm.rotation.z],
  };
}

describe('Hans articulated walk task-arm ownership', () => {
  it.each([
    'war-room-hans-watering-can',
    'war-room-hans-espresso-tray',
    'war-room-hans-chore-prop-duster',
    'war-room-hans-chore-prop-book',
    'war-room-hans-chore-prop-letters',
    'war-room-hans-chore-prop-cloth',
    'war-room-hans-chore-prop-ash-brush',
    'war-room-hans-mop',
    'war-room-hans-mop-bucket',
  ])('treats visible task prop %s as occupying Hans hands', (propName) => {
    const { hans } = makeFixture(propName);
    expect(warRoomHansTaskHandsOccupied(hans)).toBe(true);
  });

  it('preserves both arm rotations while gait code updates a visible carried task prop frame', () => {
    const { hans, body } = makeFixture('war-room-hans-espresso-tray');
    const before = rotations(body);

    const result = preserveWarRoomHansTaskArmPose(hans, body, () => {
      body.leftArm.rotation.set(0.8, 0.7, 0.6);
      body.rightArm.rotation.set(-0.8, -0.7, -0.6);
      return 'gait-sample';
    });

    expect(result).toBe('gait-sample');
    expect(rotations(body)).toEqual(before);
  });

  it('does not steal arm ownership when the task prop is hidden or the task is no longer active', () => {
    const hidden = makeFixture('war-room-hans-chore-prop-book', { visible: false });
    expect(warRoomHansTaskHandsOccupied(hidden.hans)).toBe(false);
    preserveWarRoomHansTaskArmPose(hidden.hans, hidden.body, () => {
      hidden.body.leftArm.rotation.x = 0.42;
    });
    expect(hidden.body.leftArm.rotation.x).toBeCloseTo(0.42, 8);

    const inactive = makeFixture('war-room-hans-watering-can', { activeTask: '' });
    expect(warRoomHansTaskHandsOccupied(inactive.hans)).toBe(false);
  });

  it('does not lock arms for an already delivered room prop', () => {
    const { hans } = makeFixture('war-room-hans-delivered-espresso');
    expect(warRoomHansTaskHandsOccupied(hans)).toBe(false);
  });

  it('restores the carried pose even if a gait update throws', () => {
    const { hans, body } = makeFixture('war-room-hans-mop');
    const before = rotations(body);

    expect(() => preserveWarRoomHansTaskArmPose(hans, body, () => {
      body.leftArm.rotation.set(1, 1, 1);
      body.rightArm.rotation.set(-1, -1, -1);
      throw new Error('synthetic gait failure');
    })).toThrow('synthetic gait failure');

    expect(rotations(body)).toEqual(before);
  });
});
