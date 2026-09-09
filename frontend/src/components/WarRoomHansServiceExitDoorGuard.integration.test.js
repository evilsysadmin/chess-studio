import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { installWarRoomHansServiceExitDoorGuard } from './WarRoomHansServiceExitDoorGuard.js';

describe('Hans service exit door guard installation', () => {
  it('installs only once on the War Room floor', () => {
    const root = new THREE.Scene();
    const floor = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 1), new THREE.MeshBasicMaterial());
    floor.name = 'war-room-castle-floor-slab';
    root.add(floor);
    const hans = new THREE.Group();
    hans.name = 'war-room-hans-butler';
    root.add(hans);
    const group = new THREE.Group();
    const pivot = new THREE.Group();
    group.add(pivot);
    root.add(group);
    const refs = { group, pivot, closedRotation: 0, openRotation: 0.96 };

    expect(installWarRoomHansServiceExitDoorGuard(root, refs)).toBe(1);
    expect(installWarRoomHansServiceExitDoorGuard(root, refs)).toBe(0);
  });
});
