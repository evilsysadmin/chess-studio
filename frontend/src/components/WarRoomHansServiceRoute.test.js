import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { moveWarRoomHansToward, warRoomHansTargetNearObject } from './WarRoomHansServiceRoute.js';

describe('Hans service routing', () => {
  it('does not treat a missing destination as an arrival', () => {
    const hans = new THREE.Group();
    const motion = moveWarRoomHansToward(hans, null, 0.5);

    expect(motion.arrived).toBe(false);
    expect(motion.travelled).toBe(0);
    expect(motion.blocked).toBe(true);
  });

  it('builds and walks toward a real command-desk target', () => {
    const root = new THREE.Group();
    const parent = new THREE.Group();
    const deskTop = new THREE.Mesh(new THREE.BoxGeometry(3, 0.16, 1), new THREE.MeshBasicMaterial());
    deskTop.name = 'war-room-command-desk-top';
    deskTop.position.set(0, 1.03, -2);
    root.add(parent, deskTop);
    root.updateMatrixWorld(true);

    const target = warRoomHansTargetNearObject(deskTop, parent, { offsetX: -1.78, offsetZ: 0.74 });
    expect(target).toBeTruthy();

    const hans = new THREE.Group();
    hans.position.set(4, -0.34, 4);
    parent.add(hans);
    const before = hans.position.distanceTo(target);
    const motion = moveWarRoomHansToward(hans, target, 0.5);

    expect(motion.blocked).toBe(false);
    expect(motion.travelled).toBeGreaterThan(0);
    expect(hans.position.distanceTo(target)).toBeLessThan(before);
  });
});
