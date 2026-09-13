import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  faceWarRoomHansToward,
  moveWarRoomHansToward,
  placeWarRoomHansHorizontal,
  WAR_ROOM_HANS_TRANSFORM_OWNER_VERSION,
  warRoomHansLocalForward,
} from './WarRoomHansTransformOwner.js';

function makeHans(forward = 1) {
  const hans = new THREE.Group();
  const carriedLog = new THREE.Group();
  carriedLog.position.z = forward * 0.22;
  hans.userData.refs = { carriedLog };
  return hans;
}

function forwardVector(hans, localForward) {
  return new THREE.Vector3(0, 0, localForward).applyAxisAngle(
    new THREE.Vector3(0, 1, 0),
    hans.rotation.y,
  );
}

describe('War Room Hans transform owner', () => {
  it.each([1, -1])('faces the travel target using the visual local forward %s', (localForward) => {
    const hans = makeHans(localForward);
    hans.position.set(0, -0.37, 0);
    const target = new THREE.Vector3(1, 4, 0);

    const result = moveWarRoomHansToward(hans, target, 0.25);

    expect(result.blocked).toBe(false);
    expect(result.travelled).toBeCloseTo(0.25, 6);
    expect(hans.position.y).toBeCloseTo(-0.37, 8);
    const face = forwardVector(hans, localForward).normalize();
    const toward = new THREE.Vector3(target.x - hans.position.x, 0, target.z - hans.position.z).normalize();
    expect(face.dot(toward)).toBeGreaterThan(0.999);
    expect(hans.userData.warRoomHansTransformOwner).toBe(WAR_ROOM_HANS_TRANSFORM_OWNER_VERSION);
  });

  it('never lets planar placement overwrite grounding', () => {
    const hans = makeHans(-1);
    hans.position.set(2, -0.613, 3);
    const actor = { hans, body: hans.userData.refs };

    expect(placeWarRoomHansHorizontal(actor, new THREE.Vector3(-1, 99, -2))).toBe(true);
    expect(hans.position.toArray()).toEqual([-1, -0.613, -2]);
  });

  it('uses an explicit local-forward declaration before compatibility geometry hints', () => {
    const hans = makeHans(1);
    hans.userData.warRoomHansLocalForwardZ = -1;
    hans.position.set(0, 0, 0);

    expect(warRoomHansLocalForward(hans)).toBe(-1);
    expect(faceWarRoomHansToward(hans, new THREE.Vector3(0, 0, 2))).toBe(true);
    const face = forwardVector(hans, -1).normalize();
    expect(face.z).toBeGreaterThan(0.999);
  });
});
