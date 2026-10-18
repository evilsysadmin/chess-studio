import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { installPieceBodyMotion } from './WarRoomPieceBodyMotionImpl.js';

describe('War Room body pose render-hook contract', () => {
  it('forwards the six Three.js arguments and receiver for each mesh while preserving pose updates', () => {
    const scene = new THREE.Scene();
    const piece = new THREE.Group();
    piece.userData.square = 'e4';
    piece.userData.baseY = 0.1;
    piece.userData.baseScale = piece.scale.clone();
    piece.position.set(0.5, 0.1, 2.5);
    const priorCalls = [];
    const meshes = Array.from({ length: 2 }, (_, index) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.2), new THREE.MeshBasicMaterial());
      mesh.onBeforeRender = function previous(...args) {
        priorCalls.push({ receiver: this, index, args });
      };
      piece.add(mesh);
      return mesh;
    });
    scene.add(piece);
    installPieceBodyMotion(piece, 'p', { reducedMotion: false });
    const body = piece.children.find((child) => child.userData.board3DBodyMotionBody);
    expect(body).toBeTruthy();

    const renderer = { info: { render: { frame: 1 } }, userData: { board3DMotionNowMs: 500 } };
    const camera = new THREE.PerspectiveCamera();
    meshes.forEach((mesh) => {
      const args = [renderer, scene, camera, mesh.geometry, mesh.material, piece];
      mesh.onBeforeRender(...args);
      const called = priorCalls.at(-1);
      expect(called.receiver).toBe(mesh);
      expect(called.args).toEqual(args);
    });
    expect(priorCalls).toHaveLength(2);
    expect(piece.userData.board3DBodyFinishState).toBeTruthy();

    // Each rendered frame still updates the real body pose, and reaching the
    // destination clears the temporary motion state.
    piece.position.z = 0.5;
    renderer.info.render.frame = 2;
    meshes[0].onBeforeRender(renderer, scene, camera, meshes[0].geometry, meshes[0].material, piece);
    expect(piece.userData.board3DBodyFinishState).toBeNull();
    expect(priorCalls).toHaveLength(3);
    meshes.forEach((mesh) => { mesh.geometry.dispose(); mesh.material.dispose(); });
  });
});
