import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  HANS_SERVICE_FURNITURE_CLEARANCE,
  warRoomHansServiceHome,
} from './WarRoomHansServiceRoute.js';

function makeDoorScene(side) {
  const root = new THREE.Group();
  const parent = new THREE.Group();
  root.add(parent);

  const door = new THREE.Group();
  door.name = 'war-room-hans-service-door';
  door.userData.side = side;

  const recess = new THREE.Group();
  recess.name = 'war-room-hans-service-door-recess';
  recess.position.set(side * 7.695, 1.36, 2.9);
  door.add(recess);

  const refs = { group: door, recess, side };
  door.userData.refs = refs;
  root.add(door);
  root.updateMatrixWorld(true);
  return { root, parent, door, recess, refs };
}

describe('Hans service-home wall clearance', () => {
  it.each([1, -1])('keeps Hans one body-clearance inside the room for side %s', (side) => {
    const { root, parent, recess, refs } = makeDoorScene(side);
    const recessWorld = new THREE.Vector3();
    recess.getWorldPosition(recessWorld);

    const service = warRoomHansServiceHome(root, parent);

    expect(service?.doorRefs).toBe(refs);
    expect(service?.point).toBeTruthy();
    expect(service.point.z).toBeCloseTo(recessWorld.z, 6);
    expect(service.point.y).toBeCloseTo(-0.34, 6);
    expect(side * (recessWorld.x - service.point.x))
      .toBeCloseTo(HANS_SERVICE_FURNITURE_CLEARANCE, 6);
    expect(Math.abs(service.point.x)).toBeLessThan(Math.abs(recessWorld.x));
  });

  it('infers the wall side from recess world X for legacy refs without side metadata', () => {
    const { root, parent, door, recess } = makeDoorScene(-1);
    delete door.userData.side;
    delete door.userData.refs.side;
    root.updateMatrixWorld(true);

    const recessWorld = new THREE.Vector3();
    recess.getWorldPosition(recessWorld);
    const service = warRoomHansServiceHome(root, parent);

    expect(service?.point.x).toBeCloseTo(
      recessWorld.x + HANS_SERVICE_FURNITURE_CLEARANCE,
      6,
    );
  });
});
