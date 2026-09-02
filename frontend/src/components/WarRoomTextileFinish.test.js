import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  WAR_ROOM_TEXTILE_FINISH_VERSION,
  applyWarRoomTextileFinish,
  installWarRoomTextileFinish,
} from './WarRoomTextileFinish.js';

function mesh(name, material) {
  const item = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  item.name = name;
  return item;
}

function leatherMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0x4b1f25,
    metalness: 0.02,
    roughness: 0.5,
    sheen: 0.5,
    sheenColor: 0x9b5961,
  });
}

function buildTextileFixture() {
  const root = new THREE.Group();

  const left = new THREE.Group();
  left.name = 'war-room-sofa-left';
  left.add(mesh('left-leather-a', leatherMaterial()));
  left.add(mesh('left-leather-b', leatherMaterial()));
  left.add(mesh('left-walnut', new THREE.MeshPhysicalMaterial({ color: 0x3b2114, roughness: 0.52, sheen: 0 })));
  root.add(left);

  const right = new THREE.Group();
  right.name = 'war-room-sofa-right';
  right.add(mesh('right-leather', leatherMaterial()));
  root.add(right);

  const curtainA = mesh('war-room-velvet-curtain-fold', new THREE.MeshPhysicalMaterial({ color: 0x481821, roughness: 0.9, sheen: 0.5 }));
  const curtainB = mesh('war-room-velvet-curtain-fold', new THREE.MeshPhysicalMaterial({ color: 0x321219, roughness: 0.92, sheen: 0.44 }));
  root.add(curtainA, curtainB);

  const carpet = mesh('war-room-command-carpet-bed', new THREE.MeshPhysicalMaterial({ color: 0x321419, roughness: 0.94 }));
  const carpetInner = mesh('war-room-command-carpet-inner-field', new THREE.MeshPhysicalMaterial({ color: 0x21181a, roughness: 0.96 }));
  root.add(carpet, carpetInner);

  return { root, left, right, curtainA, curtainB, carpet, carpetInner };
}

describe('War Room textile microfinish', () => {
  it('adds three shared 64px procedural maps without touching timber', () => {
    const { root, left, right, curtainA, curtainB, carpet, carpetInner } = buildTextileFixture();
    const tuned = applyWarRoomTextileFinish(root);

    expect(tuned).toBe(7);
    expect(root.userData.warRoomTextileFinish).toBe(WAR_ROOM_TEXTILE_FINISH_VERSION);
    expect(root.userData.warRoomTextileFinishStats).toEqual({
      tuned: 7,
      leatherMaterials: 3,
      velvetMaterials: 2,
      woolMaterials: 2,
      textureCount: 3,
      textureResolution: 64,
    });

    const leftLeather = left.getObjectByName('left-leather-a').material;
    const secondLeather = left.getObjectByName('left-leather-b').material;
    const rightLeather = right.getObjectByName('right-leather').material;
    const timber = left.getObjectByName('left-walnut').material;

    expect(leftLeather.bumpMap).toBe(leftLeather.roughnessMap);
    expect(secondLeather.bumpMap).toBe(leftLeather.bumpMap);
    expect(rightLeather.bumpMap).toBe(leftLeather.bumpMap);
    expect(leftLeather.bumpMap.userData.warRoomTextileKind).toBe('leather');
    expect(leftLeather.bumpMap.userData.warRoomTextileResolution).toEqual([64, 64]);
    expect(timber.bumpMap).toBeNull();
    expect(timber.roughnessMap).toBeNull();

    expect(curtainA.material.bumpMap).toBe(curtainB.material.bumpMap);
    expect(curtainA.material.bumpMap.userData.warRoomTextileKind).toBe('velvet');
    expect(carpet.material.bumpMap).toBe(carpetInner.material.bumpMap);
    expect(carpet.material.bumpMap.userData.warRoomTextileKind).toBe('wool');
    expect(new Set([
      leftLeather.bumpMap,
      curtainA.material.bumpMap,
      carpet.material.bumpMap,
    ]).size).toBe(3);
  });

  it('is idempotent once the room has been finished', () => {
    const { root } = buildTextileFixture();
    expect(applyWarRoomTextileFinish(root)).toBe(7);
    const stats = root.userData.warRoomTextileFinishStats;
    expect(applyWarRoomTextileFinish(root)).toBe(0);
    expect(root.userData.warRoomTextileFinishStats).toBe(stats);
  });

  it('chains after the existing castle render driver and applies on first paint', () => {
    const { root } = buildTextileFixture();
    const wall = mesh('war-room-castle-wall-left', new THREE.MeshStandardMaterial({ color: 0x555555 }));
    const previous = vi.fn();
    wall.onBeforeRender = previous;
    root.add(wall);

    expect(installWarRoomTextileFinish(root, { coarsePointer: false })).toBe(1);
    expect(root.userData.warRoomTextileFinish).toBeUndefined();
    wall.onBeforeRender();

    expect(previous).toHaveBeenCalledTimes(1);
    expect(root.userData.warRoomTextileFinish).toBe(WAR_ROOM_TEXTILE_FINISH_VERSION);
    expect(root.userData.warRoomTextileFinishStats.tuned).toBe(7);
    expect(installWarRoomTextileFinish(root, { coarsePointer: false })).toBe(0);
  });

  it('adds no driver or textures on coarse/mobile rendering', () => {
    const { root } = buildTextileFixture();
    const wall = mesh('war-room-castle-wall-left', new THREE.MeshStandardMaterial({ color: 0x555555 }));
    root.add(wall);

    expect(installWarRoomTextileFinish(root, { coarsePointer: true })).toBe(0);
    expect(wall.userData.warRoomTextileFinishDriver).toBeUndefined();
    expect(root.userData.warRoomTextileFinish).toBeUndefined();
  });
});
