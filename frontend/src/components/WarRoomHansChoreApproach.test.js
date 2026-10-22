import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { findWarRoomHansChoreApproach as approach } from './WarRoomHansChoreApproach.js';
import { warRoomHansBuildSafeRoute } from './WarRoomHansNavigation.js';

function room({ trimWidth = 3.35 } = {}) {
  const root = new THREE.Group();
  const parent = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(16.5, 0.09, 13.6), new THREE.MeshBasicMaterial());
  floor.name = 'war-room-castle-floor-slab';
  floor.position.y = -0.305;
  const desk = new THREE.Group();
  desk.name = 'war-room-teutonic-command-desk-v28';
  desk.position.z = -6.15;
  const top = new THREE.Mesh(new THREE.BoxGeometry(3.05, 0.16, 1), new THREE.MeshBasicMaterial());
  top.name = 'war-room-command-desk-top';
  const trim = new THREE.Mesh(new THREE.BoxGeometry(trimWidth, 0.04, 1.05), new THREE.MeshBasicMaterial());
  desk.add(top, trim);
  root.add(parent, floor, desk);
  root.updateMatrixWorld(true);
  return { root, parent, floor, top };
}
const home = new THREE.Vector3(-7.11, -0.34, 0.47);
const plainFlank = new THREE.Vector3(-2.14, -0.34, -6.03);

describe('Hans physically verified desktop flank fallback', () => {
  it('finds a bounded outer desk approach when the rendered trim blocks the normal landing', () => {
    const { floor, parent, top } = room();
    expect(warRoomHansBuildSafeRoute(floor, parent, home, plainFlank)).toEqual([]);
    const selected = approach({ floor, parent, home, target: plainFlank, targetObject: top });
    expect(selected.extraStandoff).toBeGreaterThan(0);
    expect(selected.extraStandoff).toBeLessThanOrEqual(0.48);
    expect(selected.target.x).toBeLessThan(plainFlank.x);
    expect(selected.routeIn.length).toBeGreaterThan(0);
    expect(selected.routeOut.length).toBeGreaterThan(0);
    expect(selected.routeIn.at(-1).x).toBeCloseTo(selected.target.x);
    expect(selected.routeOut.at(-1).x).toBeCloseTo(home.x);
  });

  it('does not perturb the original route if its target already clears the furniture', () => {
    const { floor, parent, top } = room({ trimWidth: 3.05 });
    const safeTarget = new THREE.Vector3(-2.65, -0.34, -6.03);
    const selected = approach({ floor, parent, home, target: safeTarget, targetObject: top });
    expect(selected.extraStandoff).toBe(0);
    expect(selected.target).toEqual(safeTarget);
    expect(selected.routeIn.length).toBeGreaterThan(0);
    expect(selected.routeOut.length).toBeGreaterThan(0);
  });

  it('fails closed instead of applying a desk detour to other targets or entering the board', () => {
    const { floor, parent } = room();
    const other = new THREE.Group();
    other.name = 'war-room-non-desk-prop';
    const invalid = new THREE.Vector3(0, -0.34, 0);
    const selected = approach({ floor, parent, home, target: invalid, targetObject: other });
    expect(selected.routeIn).toEqual([]);
    expect(selected.routeOut).toEqual([]);
    expect(selected.target).toBe(invalid);
  });
});
