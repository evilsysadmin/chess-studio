import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { installPieceBodyMotion } from './WarRoomPieceBodyMotion.js';
import { hasWarRoomMoveLightGuard } from './WarRoomMoveAnimationLifecycle.js';

describe('War Room mesh render callback forwarding', () => {
  it('preserves the original receiver and all six Three.js arguments while guarding movement', () => {
    const scene = new THREE.Scene();
    const warm = new THREE.PointLight(0xffa449, 4.2, 16, 2);
    warm.position.set(-4.6, 4.4, -5.8);
    scene.add(warm);

    const piece = new THREE.Group();
    piece.position.set(0.5, 0.1, 0.5);
    piece.userData.square = 'e4';
    piece.userData.baseY = 0.1;
    piece.userData.baseScale = piece.scale.clone();

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    const received = [];
    mesh.onBeforeRender = function original(...args) {
      received.push({ receiver: this, args });
    };
    piece.add(mesh);
    scene.add(piece);

    installPieceBodyMotion(piece, 'p');
    // Installing twice must not wrap the callback a second time.
    installPieceBodyMotion(piece, 'p');

    const renderer = { info: { render: { frame: 1 } } };
    const camera = new THREE.PerspectiveCamera();
    const args = [renderer, scene, camera, geometry, material, piece];

    mesh.onBeforeRender(...args);
    expect(received).toHaveLength(1);
    expect(received[0].receiver).toBe(mesh);
    expect(received[0].args).toEqual(args);
    expect(hasWarRoomMoveLightGuard(scene, piece)).toBe(false);

    piece.position.z = 2.5;
    renderer.info.render.frame = 2;
    mesh.onBeforeRender(...args);
    expect(received).toHaveLength(2);
    expect(received[1].receiver).toBe(mesh);
    expect(received[1].args).toEqual(args);
    expect(hasWarRoomMoveLightGuard(scene, piece)).toBe(true);

    piece.position.z = 0.5;
    renderer.info.render.frame = 3;
    mesh.onBeforeRender(...args);
    expect(hasWarRoomMoveLightGuard(scene, piece)).toBe(false);
    geometry.dispose();
    material.dispose();
  });
});
