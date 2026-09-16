import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  HANS_SERVICE_FURNITURE_CLEARANCE,
  warRoomHansTargetNearObject,
} from './WarRoomHansServiceRoute.js';

function fireplaceRig(frontSign) {
  const root = new THREE.Group();
  const parent = new THREE.Group();
  const fireplace = new THREE.Group();
  fireplace.name = 'war-room-fireplace';
  fireplace.position.set(-4.95, 0.34, -frontSign * 6.67);

  const hearth = new THREE.Mesh(
    new THREE.BoxGeometry(1.72, 0.035, 0.66),
    new THREE.MeshBasicMaterial(),
  );
  hearth.name = 'war-room-fireplace-refractory-hearth';
  hearth.position.set(0, 0.135, frontSign * 0.26);
  fireplace.add(hearth);
  root.add(parent, fireplace);
  root.updateMatrixWorld(true);
  return { root, parent, fireplace, hearth };
}

describe('Hans fireplace chore target orientation', () => {
  it.each([1, -1])('stands in front of the rendered hearth when room-facing Z sign is %s', (frontSign) => {
    const { parent, fireplace, hearth } = fireplaceRig(frontSign);
    const target = warRoomHansTargetNearObject(fireplace, parent, {
      offsetX: 0.92,
      offsetZ: 0.70,
    });
    const hearthBox = new THREE.Box3().setFromObject(hearth);
    const frontPlaneZ = frontSign > 0 ? hearthBox.max.z : hearthBox.min.z;

    expect(target).toBeTruthy();
    expect(target.x).toBeCloseTo(fireplace.position.x + 0.92, 6);
    expect(target.z).toBeCloseTo(
      frontPlaneZ + frontSign * HANS_SERVICE_FURNITURE_CLEARANCE,
      6,
    );
    expect(Math.sign(target.z - frontPlaneZ)).toBe(frontSign);
  });

  it.each([1, -1])('falls back toward board centre before refractory art exists for room-facing sign %s', (frontSign) => {
    const root = new THREE.Group();
    const parent = new THREE.Group();
    const fireplace = new THREE.Group();
    fireplace.name = 'war-room-fireplace';
    fireplace.position.set(-4.95, 0.34, -frontSign * 6.67);
    root.add(parent, fireplace);
    root.updateMatrixWorld(true);

    const target = warRoomHansTargetNearObject(fireplace, parent, {
      offsetX: 0.92,
      offsetZ: 0.70,
    });

    expect(target).toBeTruthy();
    expect(target.x).toBeCloseTo(fireplace.position.x + 0.92, 6);
    expect(target.z).toBeCloseTo(fireplace.position.z + frontSign * 0.70, 6);
    expect(Math.sign(target.z - fireplace.position.z)).toBe(frontSign);
  });
});
