import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { batchWarRoomStaticDecor } from './WarRoomPerformanceBudget.js';

function addBox(parent, name, material, size, position) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

describe('War Room premium static batching', () => {
  it('instances repeated painting trim and furniture boxes while preserving local transforms', () => {
    const scene = new THREE.Scene();
    const painting = new THREE.Group();
    painting.name = 'war-room-premium-painting-0';
    const desk = new THREE.Group();
    desk.name = 'war-room-teutonic-command-desk-v28';
    const gilt = new THREE.MeshStandardMaterial({ color: 0xb78a43 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x321b10 });

    const barPositions = [
      [0, 0.86, 0.122],
      [0, -0.86, 0.122],
      [-1.19, 0, 0.122],
      [1.19, 0, 0.122],
    ];
    for (const position of barPositions) {
      addBox(painting, 'war-room-premium-frame-outer-bar', gilt, [2.42, 0.085, 0.052], position);
    }

    const drawerPositions = [
      [-1, 0.31, 0.405], [-1, 0.55, 0.405], [-1, 0.79, 0.405],
      [1, 0.31, 0.405], [1, 0.55, 0.405], [1, 0.79, 0.405],
    ];
    for (const position of drawerPositions) {
      addBox(desk, 'war-room-command-desk-drawer', wood, [0.6, 0.16, 0.045], position);
    }

    scene.add(painting, desk);
    const result = batchWarRoomStaticDecor(scene);

    expect(result).toEqual({ batches: 2, sourceMeshes: 10, drawCallsRetired: 8 });
    const bars = painting.getObjectByName('war-room-premium-frame-outer-bar');
    const drawers = desk.getObjectByName('war-room-command-desk-drawer');
    expect(bars?.isInstancedMesh).toBe(true);
    expect(drawers?.isInstancedMesh).toBe(true);
    expect(bars.count).toBe(4);
    expect(drawers.count).toBe(6);

    const matrix = new THREE.Matrix4();
    const restored = new THREE.Vector3();
    bars.getMatrixAt(3, matrix);
    restored.setFromMatrixPosition(matrix);
    expect(restored.x).toBeCloseTo(1.19);
    expect(restored.y).toBeCloseTo(0);
    expect(restored.z).toBeCloseTo(0.122);

    drawers.getMatrixAt(5, matrix);
    restored.setFromMatrixPosition(matrix);
    expect(restored.x).toBeCloseTo(1);
    expect(restored.y).toBeCloseTo(0.79);
    expect(restored.z).toBeCloseTo(0.405);
  });

  it('does not batch similarly named meshes unless they are explicitly allow-listed', () => {
    const scene = new THREE.Scene();
    const parent = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: 0x444444 });
    addBox(parent, 'war-room-random-static-box', material, [1, 1, 1], [-1, 0, 0]);
    addBox(parent, 'war-room-random-static-box', material, [1, 1, 1], [1, 0, 0]);
    scene.add(parent);

    expect(batchWarRoomStaticDecor(scene)).toEqual({ batches: 0, sourceMeshes: 0, drawCallsRetired: 0 });
    expect(parent.children).toHaveLength(2);
    expect(parent.children.every((child) => child.isMesh && !child.isInstancedMesh)).toBe(true);
  });
});
