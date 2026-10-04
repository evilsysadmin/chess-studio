import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  WAR_ROOM_HANS_ANCHORS,
  installWarRoomHansVariantStage,
  readWarRoomHansStageAnchors,
  warRoomHansRoom,
} from './WarRoomHansStage.js';

// v3 armory hall as validated in the runtime prototype, shell-local three.js
// coordinates (Blender x, z, -y): hearth on the back wall, service door on the
// left wall, corridor round the side and back armor.
const HEARTH = [0, 0, -6.95];
const LAYOUT = {
  [WAR_ROOM_HANS_ANCHORS.hearth]: HEARTH,
  [WAR_ROOM_HANS_ANCHORS.door]: [-8.3, 0, -6.65],
  [WAR_ROOM_HANS_ANCHORS.basket]: [1.45, 0, -6.67],
  [WAR_ROOM_HANS_ANCHORS.tools]: [2.0, 0, -6.65],
  [`${WAR_ROOM_HANS_ANCHORS.corridorPrefix}0`]: [-5.2, 0, -5.7],
  [`${WAR_ROOM_HANS_ANCHORS.corridorPrefix}1`]: [-3.6, 0, -5.6],
  [`${WAR_ROOM_HANS_ANCHORS.corridorPrefix}2`]: [-2.0, 0, -5.85],
};

function shell({ whiteSide = true, leaf = true, skip = [] } = {}) {
  const root = new THREE.Group();
  root.position.y = -1.12;
  if (!whiteSide) root.rotation.y = Math.PI;
  root.userData.warRoomVariant = 'v3';
  Object.entries(LAYOUT).forEach(([name, [x, y, z]]) => {
    if (skip.includes(name)) return;
    const anchor = new THREE.Object3D();
    anchor.name = name;
    anchor.position.set(x, y, z);
    root.add(anchor);
  });
  if (leaf) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 1.1), new THREE.MeshBasicMaterial());
    door.name = WAR_ROOM_HANS_ANCHORS.doorLeaf;
    door.position.set(-8.48, 0, -6.95);
    door.userData.war_room_hans_door_open_yaw = -1.3;
    root.add(door);
  }
  return root;
}

function roundPairs(points) {
  return points.map(([a, b]) => [Number(a.toFixed(2)), Number(b.toFixed(2))]);
}

describe('WarRoomHansStage', () => {
  it('offers Hans to every Blender War Room but never to the Duel Room', () => {
    expect(warRoomHansRoom('v2')).toBeTruthy();
    expect(warRoomHansRoom('v3')).toBeTruthy();
    expect(warRoomHansRoom('v4')).toBeTruthy();
    expect(warRoomHansRoom('duel')).toBeNull();
    expect(warRoomHansRoom('classic')).toBeNull();
  });

  it('reads the anchors into the hearth frame the v1 routine walks in', () => {
    const scene = new THREE.Scene();
    const root = shell();
    scene.add(root);
    const anchors = readWarRoomHansStageAnchors(root, { id: 'v3-armory-hall' });
    expect(anchors.missing).toEqual([]);
    expect(anchors.side).toBe(-1);
    expect(anchors.towardBoard).toBe(1);
    expect(anchors.stage.doorX).toBeCloseTo(8.3);
    expect(anchors.stage.basketX).toBeCloseTo(-1.45);
    expect(anchors.stage.basketZ).toBeCloseTo(0.28);
    expect(anchors.stage.toolsX).toBeCloseTo(-2.0);
    expect(roundPairs(anchors.stage.corridor)).toEqual([[8.3, 0.3], [5.2, 1.25], [3.6, 1.35], [2.0, 1.1]]);
  });

  it('gives the same walk from the black side, where the shell is turned round', () => {
    const scene = new THREE.Scene();
    const root = shell({ whiteSide: false });
    scene.add(root);
    const anchors = readWarRoomHansStageAnchors(root);
    expect(anchors.side).toBe(1);
    expect(anchors.towardBoard).toBe(-1);
    expect(roundPairs(anchors.stage.corridor)).toEqual([[8.3, 0.3], [5.2, 1.25], [3.6, 1.35], [2.0, 1.1]]);
  });

  it('leaves a room without the full anchor set untouched', () => {
    const scene = new THREE.Scene();
    const root = shell({ leaf: false, skip: [`${WAR_ROOM_HANS_ANCHORS.corridorPrefix}0`] });
    scene.add(root);
    const before = scene.children.length;
    const hans = installWarRoomHansVariantStage(scene, { variant: 'v3', shellRoot: root });
    expect(hans.status).toBe('missing:doorLeaf,corridor');
    expect(scene.children.length).toBe(before);
    expect(scene.getObjectByName('war-room-fireplace')).toBeUndefined();
    hans.release();
  });

  it('never installs in the Duel Room even if its shell carried anchors', () => {
    const scene = new THREE.Scene();
    const root = shell();
    scene.add(root);
    const hans = installWarRoomHansVariantStage(scene, { variant: 'duel', shellRoot: root });
    expect(hans.status).toBe('no-room');
    expect(scene.getObjectByName('war-room-fireplace')).toBeUndefined();
  });

  it('installs Hans at the hearth, swings the authored leaf and releases cleanly', () => {
    const scene = new THREE.Scene();
    const root = shell();
    scene.add(root);
    const leaf = root.getObjectByName(WAR_ROOM_HANS_ANCHORS.doorLeaf);
    const hans = installWarRoomHansVariantStage(scene, { variant: 'v3', shellRoot: root });
    expect(hans.status).toMatch(/^v3-armory-hall:(quick|idle)$/);

    const fireplace = scene.getObjectByName('war-room-fireplace');
    const world = new THREE.Vector3();
    fireplace.getWorldPosition(world);
    expect(world.z).toBeCloseTo(HEARTH[2]);
    expect(scene.getObjectByName('war-room-hans-butler')).toBeTruthy();
    // The Blender leaf replaces the procedural door.
    expect(scene.getObjectByName('war-room-hans-service-door')).toBeUndefined();
    const pivot = leaf.parent;
    expect(pivot.name).toBe('war-room-hans-door-pivot');
    expect(pivot.userData.refs.openRotation).toBe(-1.3);
    leaf.getWorldPosition(world);
    expect(world.x).toBeCloseTo(-8.48);

    hans.release();
    expect(scene.getObjectByName('war-room-fireplace')).toBeUndefined();
    expect(leaf.parent).toBe(root);
    expect(leaf.position.x).toBeCloseTo(-8.48);
    expect(root.getObjectByName('war-room-hans-door-pivot')).toBeUndefined();
  });
});
