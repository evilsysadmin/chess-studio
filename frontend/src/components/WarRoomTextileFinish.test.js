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

  const floor = mesh('war-room-castle-floor-slab', new THREE.MeshPhysicalMaterial({ color: 0x8b8173, roughness: 0.6 }));
  root.add(floor);

  const coarseWallTexture = new THREE.DataTexture(new Uint8Array(4 * 4 * 4), 4, 4);
  const wallMaterial = new THREE.MeshPhysicalMaterial({ color: 0x686057, roughness: 0.84 });
  wallMaterial.bumpMap = coarseWallTexture;
  wallMaterial.roughnessMap = coarseWallTexture;
  wallMaterial.bumpScale = 0.022;
  const wallLeft = mesh('war-room-castle-wall-left', wallMaterial);
  const wallRight = mesh('war-room-castle-wall-right', wallMaterial);
  root.add(wallLeft, wallRight);

  const walnut = new THREE.MeshPhysicalMaterial({ color: 0x3b2417, metalness: 0.01, roughness: 0.62 });
  const walnutDark = new THREE.MeshPhysicalMaterial({ color: 0x1b100a, metalness: 0.01, roughness: 0.76 });
  const brass = new THREE.MeshPhysicalMaterial({ color: 0x6f4a20, metalness: 0.72, roughness: 0.34 });
  const nestedPaper = new THREE.MeshPhysicalMaterial({ color: 0xb7a67e, metalness: 0, roughness: 0.91 });

  const leftConsole = new THREE.Group();
  leftConsole.name = 'war-room-side-console-left';
  leftConsole.add(mesh('war-room-side-console-top', walnut));
  leftConsole.add(mesh('left-console-leg', walnutDark));
  leftConsole.add(mesh('left-console-brass-edge', brass));
  const folio = new THREE.Group();
  folio.name = 'war-room-console-field-folio';
  folio.add(mesh('folio-paper', nestedPaper));
  leftConsole.add(folio);
  root.add(leftConsole);

  const rightConsole = new THREE.Group();
  rightConsole.name = 'war-room-side-console-right';
  rightConsole.add(mesh('war-room-side-console-top', walnut));
  rightConsole.add(mesh('right-console-leg', walnutDark));
  rightConsole.add(mesh('right-console-brass-edge', brass));
  root.add(rightConsole);

  return {
    root,
    left,
    right,
    curtainA,
    curtainB,
    carpet,
    carpetInner,
    floor,
    walnut,
    walnutDark,
    brass,
    nestedPaper,
    coarseWallTexture,
    wallMaterial,
  };
}

describe('War Room surface microfinish', () => {
  it('adds six shared 64px procedural maps to textiles and core room surfaces', () => {
    const {
      root,
      left,
      right,
      curtainA,
      curtainB,
      carpet,
      carpetInner,
      floor,
      walnut,
      walnutDark,
      brass,
      nestedPaper,
      coarseWallTexture,
      wallMaterial,
    } = buildTextileFixture();
    const tuned = applyWarRoomTextileFinish(root);

    expect(tuned).toBe(11);
    expect(root.userData.warRoomTextileFinish).toBe(WAR_ROOM_TEXTILE_FINISH_VERSION);
    expect(root.userData.warRoomTextileFinishStats).toEqual({
      tuned: 11,
      leatherMaterials: 3,
      velvetMaterials: 2,
      woolMaterials: 2,
      limestoneMaterials: 1,
      walnutMaterials: 2,
      ashlarMaterials: 1,
      textureCount: 6,
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

    expect(floor.material.bumpMap).toBe(floor.material.roughnessMap);
    expect(floor.material.bumpMap.userData.warRoomSurfaceKind).toBe('limestone');
    expect(floor.material.bumpScale).toBeCloseTo(0.011);

    expect(walnut.bumpMap).toBe(walnut.roughnessMap);
    expect(walnutDark.bumpMap).toBe(walnut.bumpMap);
    expect(walnut.bumpMap.userData.warRoomSurfaceKind).toBe('walnut');
    expect(brass.bumpMap).toBeNull();
    expect(nestedPaper.bumpMap).toBeNull();

    expect(wallMaterial.roughnessMap.userData.warRoomSurfaceKind).toBe('ashlar');
    expect(wallMaterial.bumpMap).toBe(coarseWallTexture);
    expect(wallMaterial.bumpScale).toBeCloseTo(0.022);

    expect(new Set([
      leftLeather.bumpMap,
      curtainA.material.bumpMap,
      carpet.material.bumpMap,
      floor.material.bumpMap,
      walnut.bumpMap,
      wallMaterial.roughnessMap,
    ]).size).toBe(6);
  });

  it('is idempotent once the room has been finished', () => {
    const { root } = buildTextileFixture();
    expect(applyWarRoomTextileFinish(root)).toBe(11);
    const stats = root.userData.warRoomTextileFinishStats;
    expect(applyWarRoomTextileFinish(root)).toBe(0);
    expect(root.userData.warRoomTextileFinishStats).toBe(stats);
  });

  it('chains after the existing castle render driver and applies on first paint', () => {
    const { root } = buildTextileFixture();
    const wall = root.getObjectByName('war-room-castle-wall-left');
    const previous = vi.fn();
    wall.onBeforeRender = previous;

    expect(installWarRoomTextileFinish(root, { coarsePointer: false })).toBe(1);
    expect(root.userData.warRoomTextileFinish).toBeUndefined();
    wall.onBeforeRender();

    expect(previous).toHaveBeenCalledTimes(1);
    expect(root.userData.warRoomTextileFinish).toBe(WAR_ROOM_TEXTILE_FINISH_VERSION);
    expect(root.userData.warRoomTextileFinishStats.tuned).toBe(11);
    expect(installWarRoomTextileFinish(root, { coarsePointer: false })).toBe(0);
  });

  it('adds no driver or textures on coarse/mobile rendering', () => {
    const { root } = buildTextileFixture();
    const wall = root.getObjectByName('war-room-castle-wall-left');

    expect(installWarRoomTextileFinish(root, { coarsePointer: true })).toBe(0);
    expect(wall.userData.warRoomTextileFinishDriver).toBeUndefined();
    expect(root.userData.warRoomTextileFinish).toBeUndefined();
  });
});
