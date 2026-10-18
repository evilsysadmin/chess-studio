import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { installPieceBodyMotion, resetPieceBodyMotion } from './WarRoomPieceBodyMotion.js';
import { hasWarRoomMoveLightGuard } from './WarRoomMoveAnimationLifecycle.js';

function makeScene() {
  const scene = new THREE.Scene();
  const warm = new THREE.PointLight(0xffa449, 4.2, 16, 2);
  warm.position.set(-4.6, 4.4, -5.8);
  const rim = new THREE.PointLight(0x88aaff, 7.3, 19, 2);
  rim.position.set(4.8, 3.6, -4.8);
  scene.add(warm, rim);
  return scene;
}

describe('War Room per-piece light target reuse', () => {
  it('rechecks each mesh and refreshes the destination when a piece changes squares', () => {
    const scene = makeScene();
    const piece = new THREE.Group();
    piece.userData.square = 'e4';
    piece.userData.baseY = 0.1;
    piece.userData.baseScale = piece.scale.clone();
    piece.position.set(0.5, 0.1, 2.5);
    const meshes = [0, 1].map(() => new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
    ));
    meshes.forEach((mesh) => piece.add(mesh));
    scene.add(piece);

    installPieceBodyMotion(piece, 'p');
    const renderer = { info: { render: { frame: 1 } } };

    meshes[0].onBeforeRender(renderer, scene);
    meshes[1].onBeforeRender(renderer, scene);
    expect(hasWarRoomMoveLightGuard(scene, piece)).toBe(true);

    // The same destination is checked on every mesh, even within one frame.
    piece.position.z = 0.5;
    meshes[1].onBeforeRender(renderer, scene);
    expect(hasWarRoomMoveLightGuard(scene, piece)).toBe(false);

    // Reconciliation can change the target without remounting the piece.
    piece.userData.square = 'f4';
    meshes[0].onBeforeRender(renderer, scene);
    expect(hasWarRoomMoveLightGuard(scene, piece)).toBe(true);

    piece.position.x = 1.5;
    meshes[1].onBeforeRender(renderer, scene);
    expect(hasWarRoomMoveLightGuard(scene, piece)).toBe(false);

    // Reset still rolls back the guard after a subsequent move.
    piece.userData.square = 'g4';
    meshes[0].onBeforeRender(renderer, scene);
    expect(hasWarRoomMoveLightGuard(scene, piece)).toBe(true);
    expect(resetPieceBodyMotion(piece)).toBe(true);
    expect(hasWarRoomMoveLightGuard(scene, piece)).toBe(false);
  });
});
