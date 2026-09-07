import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { applyWarRoomPerformanceBudget } from './WarRoomPerformanceBudget.js';

function mesh(name) {
  const object = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x555555 }),
  );
  object.name = name;
  return object;
}

describe('War Room performance budget hot path', () => {
  it('combines static batching and budget classification into one root traversal', () => {
    const scene = new THREE.Scene();
    const parent = new THREE.Group();
    parent.name = 'war-room-upper-architecture';
    const material = new THREE.MeshStandardMaterial({ color: 0x563b24 });

    for (const x of [-2, 0, 2]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.2, 0.25), material);
      beam.name = 'war-room-hammerbeam-transverse';
      beam.position.set(x, 4.5, -1.25);
      beam.castShadow = true;
      beam.receiveShadow = true;
      parent.add(beam);
    }
    scene.add(parent);

    const originalTraverse = scene.traverse.bind(scene);
    let rootTraversals = 0;
    scene.traverse = (visitor) => {
      rootTraversals += 1;
      return originalTraverse(visitor);
    };

    applyWarRoomPerformanceBudget(scene);

    expect(rootTraversals).toBe(1);
    expect(scene.userData.warRoomPerformanceTraversal).toBe('single-pass-v1');
    const batch = parent.getObjectByName('war-room-hammerbeam-transverse');
    expect(batch?.isInstancedMesh).toBe(true);
    expect(batch.count).toBe(3);
    expect(batch.castShadow).toBe(false);
  });

  it('retires the late-practical outer hook after the first rendered frame', () => {
    const scene = new THREE.Scene();
    const floor = mesh('war-room-castle-floor-slab');
    const previous = vi.fn();
    floor.onAfterRender = previous;
    const premium = new THREE.Group();
    premium.name = 'premium-war-room-layer';
    scene.add(floor, premium);

    applyWarRoomPerformanceBudget(scene);
    const armed = floor.onAfterRender;
    expect(armed).not.toBe(previous);

    const banker = new THREE.PointLight(0xffc76b, 3.45, 5.6, 2);
    banker.position.set(4.4, 2.5, -6.5);
    premium.add(banker);

    armed();

    expect(previous).toHaveBeenCalledTimes(1);
    expect(banker.parent).toBeNull();
    expect(floor.userData.warRoomLatePracticalLightRetirementCompleted).toBe(true);
    expect(floor.onAfterRender).toBe(previous);

    floor.onAfterRender();
    expect(previous).toHaveBeenCalledTimes(2);
  });
});
