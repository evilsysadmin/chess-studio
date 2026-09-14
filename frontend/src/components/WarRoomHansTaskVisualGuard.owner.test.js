import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  captureWarRoomHansTaskGroundSurfaces,
  groundWarRoomHansTaskActor,
} from './WarRoomHansTaskVisualGuard.js';
import { WAR_ROOM_HANS_TRANSFORM_OWNER_VERSION } from './WarRoomHansTransformOwner.js';

function shoe(material, x) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.38), material);
  mesh.position.set(x, 0.08, 0.07);
  return mesh;
}

describe('WarRoomHansTaskVisualGuard grounding ownership', () => {
  it('commits task grounding through the shared transform owner', () => {
    const root = new THREE.Group();
    const material = new THREE.MeshBasicMaterial();
    const floor = new THREE.Mesh(new THREE.BoxGeometry(10, 0.2, 10), material);
    floor.name = 'war-room-castle-floor-slab';
    floor.position.y = -0.1;
    root.add(floor);

    const hans = new THREE.Group();
    hans.visible = true;
    hans.position.set(1, 0.5, 1);
    root.add(hans);

    const leftShoe = shoe(material, -0.12);
    const rightShoe = shoe(material, 0.12);
    hans.add(leftShoe, rightShoe);

    const surfaces = captureWarRoomHansTaskGroundSurfaces(root);
    expect(groundWarRoomHansTaskActor(hans, { leftShoe, rightShoe }, surfaces)).toBe(true);
    expect(hans.userData.warRoomHansTransformOwner).toBe(WAR_ROOM_HANS_TRANSFORM_OWNER_VERSION);
    expect(hans.userData.warRoomHansTransformSource).toBe('task-visual-grounding');
    expect(hans.userData.warRoomHansVerticalCommitSource).toBe('task-visual-grounding');
    expect(hans.userData.warRoomHansGroundedY).toBeCloseTo(hans.position.y, 8);
  });
});
