import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { installPieceBodyMotion, resetPieceBodyMotion } from './WarRoomPieceBodyMotion.js';
import {
  armWarRoomMoveLightGuard,
  clearWarRoomMoveLightGuard,
  hasWarRoomMoveLightGuard,
} from './WarRoomMoveAnimationLifecycle.js';

function reactiveScene() {
  const scene = new THREE.Scene();
  const warm = new THREE.PointLight(0xffa449, 4.2, 16, 2);
  warm.position.set(-4.6, 4.4, -5.8);
  const rim = new THREE.PointLight(0x88aaff, 7.3, 19, 2);
  rim.position.set(4.8, 3.6, -4.8);
  const torch = new THREE.PointLight(0xffaa66, 2.5, 12, 2);
  torch.position.set(-3, 5, -7);
  scene.add(warm, rim, torch);
  return { scene, warm, rim, torch };
}

function ownerAt(x, z, square = 'e4') {
  const owner = new THREE.Group();
  owner.position.set(x, 0.1, z);
  owner.userData.square = square;
  return owner;
}

describe('War Room interrupted move light guard', () => {
  it('restores only root-animation reactive lights before the settled frame renders', () => {
    const { scene, warm, rim, torch } = reactiveScene();
    const owner = ownerAt(-0.5, 1.5);
    scene.add(owner);

    expect(armWarRoomMoveLightGuard({ scene, owner, targetSquare: 'e4', target: { x: 0.5, z: 0.5 } })).toBe(true);
    warm.intensity = 11;
    rim.intensity = 22;
    torch.intensity = 3.1;
    owner.position.set(0.5, 0.1, 0.5);

    scene.onBeforeRender();
    expect(warm.intensity).toBe(4.2);
    expect(rim.intensity).toBe(7.3);
    expect(torch.intensity).toBe(3.1);
    expect(hasWarRoomMoveLightGuard(scene)).toBe(false);
  });

  it('rolls lights back when reconciliation changes the owner square or removes it', () => {
    const first = reactiveScene();
    const owner = ownerAt(-1, 0, 'd4');
    first.scene.add(owner);
    armWarRoomMoveLightGuard({ scene: first.scene, owner, targetSquare: 'd4', target: { x: 0, z: 0 } });
    first.warm.intensity = 13;
    owner.userData.square = 'e4';
    first.scene.onBeforeRender();
    expect(first.warm.intensity).toBe(4.2);

    const second = reactiveScene();
    const removed = ownerAt(-1, 0, 'd4');
    second.scene.add(removed);
    armWarRoomMoveLightGuard({ scene: second.scene, owner: removed, targetSquare: 'd4', target: { x: 0, z: 0 } });
    second.rim.intensity = 19;
    second.scene.remove(removed);
    second.scene.onBeforeRender();
    expect(second.rim.intensity).toBe(7.3);
  });

  it('does not let another rig clear the active move guard', () => {
    const { scene, warm } = reactiveScene();
    const owner = ownerAt(-1, 0, 'd4');
    const bystander = ownerAt(2, 2, 'h8');
    scene.add(owner, bystander);
    armWarRoomMoveLightGuard({ scene, owner, targetSquare: 'd4', target: { x: 0, z: 0 } });
    warm.intensity = 14;

    expect(hasWarRoomMoveLightGuard(scene, owner)).toBe(true);
    expect(hasWarRoomMoveLightGuard(scene, bystander)).toBe(false);
    expect(clearWarRoomMoveLightGuard(scene, bystander)).toBe(false);
    expect(warm.intensity).toBe(14);
    expect(clearWarRoomMoveLightGuard(scene, owner)).toBe(true);
    expect(warm.intensity).toBe(4.2);
  });

  it('keeps the guard armed while the owner is travelling and clears idempotently', () => {
    const { scene, warm } = reactiveScene();
    const owner = ownerAt(-1, 0, 'd4');
    scene.add(owner);
    armWarRoomMoveLightGuard({ scene, owner, targetSquare: 'd4', target: { x: 0, z: 0 } });
    warm.intensity = 12;

    owner.position.x = -0.4;
    scene.onBeforeRender();
    expect(warm.intensity).toBe(12);
    expect(hasWarRoomMoveLightGuard(scene)).toBe(true);

    expect(clearWarRoomMoveLightGuard(scene)).toBe(true);
    expect(warm.intensity).toBe(4.2);
    expect(clearWarRoomMoveLightGuard(scene)).toBe(false);
  });

  it('arms through the public body-motion facade and rolls lights back on settle/reset', () => {
    const { scene, warm, rim } = reactiveScene();
    const root = ownerAt(0.5, 2.5, 'e4');
    root.userData.baseY = 0.1;
    root.userData.baseScale = root.scale.clone();
    const visual = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    root.add(visual);
    scene.add(root);

    installPieceBodyMotion(root, 'p');
    const renderer = { info: { render: { frame: 1 } } };
    visual.onBeforeRender(renderer, scene);

    expect(root.userData.board3DMoveLightGuardProfile).toBe('reactive-light-rollback-v1');
    expect(scene.userData.board3DMoveLightGuardProfile).toBe('reactive-light-rollback-v1');
    expect(hasWarRoomMoveLightGuard(scene, root)).toBe(true);

    warm.intensity = 15;
    rim.intensity = 25;
    root.position.set(0.5, 0.1, 0.5);
    scene.onBeforeRender();
    expect(warm.intensity).toBe(4.2);
    expect(rim.intensity).toBe(7.3);

    root.position.z = 2.5;
    renderer.info.render.frame = 2;
    visual.onBeforeRender(renderer, scene);
    warm.intensity = 17;
    expect(resetPieceBodyMotion(root)).toBe(true);
    expect(warm.intensity).toBe(4.2);
    expect(hasWarRoomMoveLightGuard(scene)).toBe(false);
  });
});
