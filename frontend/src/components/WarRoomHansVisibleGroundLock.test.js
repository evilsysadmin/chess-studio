import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  installWarRoomHansVisibleGroundLock,
  WAR_ROOM_HANS_VISIBLE_GROUND_LOCK_VERSION,
} from './WarRoomHansVisibleGroundLock.js';

function shoe(material, x) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.38), material);
  mesh.position.set(x, 0.08, 0.07);
  return mesh;
}

function bottomWorldY(mesh) {
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  mesh.updateMatrixWorld(true);
  return mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld).min.y;
}

describe('WarRoomHansVisibleGroundLock', () => {
  it('wins after a late writer restores the legacy standing Y', () => {
    const root = new THREE.Group();
    const material = new THREE.MeshBasicMaterial();

    const floor = new THREE.Mesh(new THREE.BoxGeometry(16.5, 0.09, 13.6), material);
    floor.name = 'war-room-castle-floor-slab';
    floor.position.set(0, -0.305, 0);
    root.add(floor);

    const carpet = new THREE.Mesh(new THREE.BoxGeometry(12.95, 0.01, 12.4), material);
    carpet.name = 'war-room-command-carpet-inner-field';
    carpet.position.set(0, -0.226, 0);
    root.add(carpet);

    const fireplace = new THREE.Group();
    fireplace.name = 'war-room-fireplace';
    fireplace.position.set(-4.95, 0.34, -7.1);
    root.add(fireplace);

    const hans = new THREE.Group();
    hans.name = 'war-room-hans-butler';
    hans.visible = true;
    hans.scale.setScalar(0.74);
    hans.position.set(4.95, -0.576, 7.1);
    fireplace.add(hans);

    const leftShoe = shoe(material, -0.17);
    const rightShoe = shoe(material, 0.17);
    hans.add(leftShoe, rightShoe);
    hans.userData.refs = { leftShoe, rightShoe };

    // Reproduce the production bug: an older choreography owner writes the
    // historical root Y after grounding but before Hans' visible mesh paints.
    leftShoe.onBeforeRender = () => {
      hans.position.y = -0.34;
      hans.updateMatrixWorld(true);
    };

    expect(installWarRoomHansVisibleGroundLock(root)).toBe(1);
    leftShoe.onBeforeRender(
      { info: { render: { frame: 17 } } },
      null,
      null,
      leftShoe.geometry,
      leftShoe.material,
      null,
    );

    const carpetTop = -0.221;
    expect(Math.min(bottomWorldY(leftShoe), bottomWorldY(rightShoe))).toBeCloseTo(carpetTop, 5);
    expect(hans.position.y).toBeLessThan(-0.5);
    expect(hans.userData.warRoomHansVisibleGroundLock).toBe(WAR_ROOM_HANS_VISIBLE_GROUND_LOCK_VERSION);
    expect(hans.userData.warRoomHansVisibleGroundSurface).toBe('war-room-command-carpet-inner-field');
    expect(hans.userData.warRoomHansVisibleGroundGap).toBeCloseTo(0, 8);
  });
});
