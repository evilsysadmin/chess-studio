import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { batchWarRoomStaticDecor } from './WarRoomPerformanceBudget.js';

function addMesh(parent, name, material, geometry, position, { castShadow = true } = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addBox(parent, name, material, size, position) {
  return addMesh(parent, name, material, new THREE.BoxGeometry(...size), position);
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

  it('instances the repeated v28 sofa, desk and chair detail families', () => {
    const scene = new THREE.Scene();

    for (const sofaSide of [-1, 1]) {
      const sofa = new THREE.Group();
      sofa.name = sofaSide < 0 ? 'war-room-teutonic-sofa-art-left' : 'war-room-teutonic-sofa-art-right';
      const walnut = new THREE.MeshStandardMaterial({ color: 0x321a10 });
      const walnutDark = new THREE.MeshStandardMaterial({ color: 0x1d0f0a });
      const brass = new THREE.MeshStandardMaterial({ color: 0x8a6228 });

      for (const side of [-1, 1]) {
        addMesh(sofa, 'war-room-sofa-scroll-finial', walnut, new THREE.SphereGeometry(0.125, 16, 10), [side * 0.97, 0.88, 0.38]);
        addMesh(sofa, 'war-room-sofa-brass-finial', brass, new THREE.SphereGeometry(0.095, 14, 9), [side * 0.94, 1.51, -0.34]);
        addMesh(sofa, 'war-room-sofa-carved-finial-cap', walnut, new THREE.ConeGeometry(0.09, 0.2, 8), [side * 0.94, 1.62, -0.34]);
      }
      for (const x of [-0.76, 0.76]) {
        for (const z of [-0.27, 0.27]) {
          addMesh(sofa, 'war-room-sofa-turned-leg', walnutDark, new THREE.CylinderGeometry(0.07, 0.09, 0.32, 12), [x, 0.16, z]);
        }
      }
      for (const x of [-0.54, -0.18, 0.18, 0.54]) {
        for (const y of [0.94, 1.18]) {
          addMesh(sofa, 'war-room-sofa-tuft-button-v28', brass, new THREE.SphereGeometry(0.032, 10, 7), [x, y, -0.292], { castShadow: false });
        }
      }
      scene.add(sofa);
    }

    const desk = new THREE.Group();
    desk.name = 'war-room-teutonic-command-desk-v28';
    const deskBrass = new THREE.MeshStandardMaterial({ color: 0x93692a });
    const deskWood = new THREE.MeshStandardMaterial({ color: 0x1b0f0a });
    for (const side of [-1, 1]) {
      for (const y of [0.31, 0.55, 0.79]) {
        addMesh(desk, 'war-room-command-desk-pull', deskBrass, new THREE.TorusGeometry(0.07, 0.011, 8, 16, Math.PI), [side, y, 0.442]);
      }
      for (const z of [-0.3, 0.3]) {
        addMesh(desk, 'war-room-command-desk-foot', deskWood, new THREE.CylinderGeometry(0.055, 0.07, 0.16, 12), [side * 1.17, 0.08, z]);
      }
    }
    scene.add(desk);

    const chair = new THREE.Group();
    chair.name = 'war-room-teutonic-command-chair';
    const chairBrass = new THREE.MeshStandardMaterial({ color: 0x94692b });
    for (const side of [-1, 1]) {
      addMesh(chair, 'war-room-command-chair-finial', chairBrass, new THREE.SphereGeometry(0.11, 14, 9), [side * 0.46, 2.08, -0.26]);
    }
    for (const [x, y] of [[-0.2, 1.18], [0.2, 1.18], [-0.2, 1.5], [0.2, 1.5]]) {
      addMesh(chair, 'war-room-command-chair-button', chairBrass, new THREE.SphereGeometry(0.03, 10, 7), [x, y, -0.13], { castShadow: false });
    }
    scene.add(chair);

    const result = batchWarRoomStaticDecor(scene);
    expect(result).toEqual({ batches: 14, sourceMeshes: 52, drawCallsRetired: 38 });

    for (const sofa of scene.children.filter((child) => child.name.startsWith('war-room-teutonic-sofa-art-'))) {
      expect(sofa.getObjectByName('war-room-sofa-tuft-button-v28')?.isInstancedMesh).toBe(true);
      expect(sofa.getObjectByName('war-room-sofa-tuft-button-v28')?.count).toBe(8);
      expect(sofa.getObjectByName('war-room-sofa-turned-leg')?.count).toBe(4);
    }
    expect(desk.getObjectByName('war-room-command-desk-pull')?.count).toBe(6);
    expect(desk.getObjectByName('war-room-command-desk-foot')?.count).toBe(4);
    expect(chair.getObjectByName('war-room-command-chair-finial')?.count).toBe(2);
    expect(chair.getObjectByName('war-room-command-chair-button')?.count).toBe(4);
  });

  it('does not batch similarly named meshes unless they are explicitly allow-listed', () => {
    const scene = new THREE.Scene();
    const parent = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: 0x444444 });
    addBox(parent, 'war-room-random-static-box', material, [1, 1, 1], [-1, 0, 0]);
    addBox(parent, 'war-room-random-static-box', material, [1, 1, 1], [1, 0, 0]);
    addMesh(parent, 'war-room-random-static-sphere', material, new THREE.SphereGeometry(0.2, 8, 6), [-1, 1, 0]);
    addMesh(parent, 'war-room-random-static-sphere', material, new THREE.SphereGeometry(0.2, 8, 6), [1, 1, 0]);
    scene.add(parent);

    expect(batchWarRoomStaticDecor(scene)).toEqual({ batches: 0, sourceMeshes: 0, drawCallsRetired: 0 });
    expect(parent.children).toHaveLength(4);
    expect(parent.children.every((child) => child.isMesh && !child.isInstancedMesh)).toBe(true);
  });
});
