import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { freezeHomeBlenderStaticTransforms } from './HomeBlenderStaticTransforms.js';

describe('Home Blender stationary GLB transform optimization', () => {
  it('preserves static world geometry while fire, Klaus, and an external actor keep moving', () => {
    const scene = new THREE.Scene();
    // The scene is the stationary world origin; lights and other moving
    // children still update their own matrices.
    expect(freezeHomeBlenderStaticTransforms(scene)).toBe(1);
    const root = new THREE.Group();
    root.position.set(1.5, -0.3, 2.2);
    const hall = new THREE.Group();
    hall.position.set(-0.2, 0.7, 0.4);
    const stone = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    stone.position.set(-2.5, 0.3, -1.7);
    stone.rotation.y = 0.18;
    hall.add(stone);
    const flame = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.1), new THREE.MeshBasicMaterial());
    flame.position.set(1, 0.3, -2);
    const cat = new THREE.Group();
    cat.position.set(0.3, 0.2, 0.4);
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.03), new THREE.MeshBasicMaterial());
    ear.position.y = 0.18;
    cat.add(ear);
    root.add(hall, flame, cat);
    const actor = new THREE.Group();
    scene.add(root, actor);
    scene.updateMatrixWorld(true);
    const expectedStone = stone.matrixWorld.clone();
    const stoneLocal = stone.matrix.clone();
    const updates = vi.spyOn(stone, 'updateMatrix');

    expect(freezeHomeBlenderStaticTransforms(root, [flame, cat])).toBe(3); // root, hall, stone
    // The one-time local matrix priming is intentional; after it, the room
    // must not call updateMatrix again during animated draws.
    expect(updates).toHaveBeenCalledTimes(1);
    updates.mockClear();
    expect(freezeHomeBlenderStaticTransforms(root, [flame, cat])).toBe(0);
    expect(root.matrixAutoUpdate).toBe(false);
    expect(hall.matrixAutoUpdate).toBe(false);
    expect(stone.matrixAutoUpdate).toBe(false);
    expect(flame.matrixAutoUpdate).toBe(true);
    expect(cat.matrixAutoUpdate).toBe(true);
    expect(ear.matrixAutoUpdate).toBe(true);
    expect(actor.matrixAutoUpdate).toBe(true);

    for (let frame = 0; frame < 30; frame += 1) {
      flame.scale.y = 1 + frame * 0.01;
      cat.rotation.z = frame * 0.015;
      ear.rotation.y = frame * 0.04;
      actor.position.x = frame * 0.2;
      scene.updateMatrixWorld();
      expect(stone.matrixWorld.equals(expectedStone)).toBe(true);
      expect(stone.matrix.equals(stoneLocal)).toBe(true);
      expect(flame.matrix.elements[5]).toBeCloseTo(1 + frame * 0.01);
      expect(ear.matrixWorld.equals(ear.matrix)).toBe(false);
      expect(actor.matrixWorld.elements[12]).toBeCloseTo(frame * 0.2);
    }
    expect(updates).not.toHaveBeenCalled();
    stone.geometry.dispose();
    stone.material.dispose();
    flame.geometry.dispose();
    flame.material.dispose();
    ear.geometry.dispose();
    ear.material.dispose();
  });

  it('leaves original explicit manual-matrix nodes untouched', () => {
    const root = new THREE.Group();
    const manual = new THREE.Group();
    manual.matrixAutoUpdate = false;
    manual.matrix.makeTranslation(4, 5, 6);
    root.add(manual);
    const untouched = manual.matrix.clone();
    expect(freezeHomeBlenderStaticTransforms(root)).toBe(1);
    expect(manual.matrix.equals(untouched)).toBe(true);
    expect(manual.matrixAutoUpdate).toBe(false);
    root.updateMatrixWorld();
    expect(manual.matrixWorld.elements.slice(12, 15)).toEqual([4, 5, 6]);
    expect(freezeHomeBlenderStaticTransforms(null)).toBe(0);
  });
});
