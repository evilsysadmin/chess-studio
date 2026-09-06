import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { installWarRoomHansMotionPolish } from './WarRoomHansMotionPolishV2.js';

function makeMinimalRig(onBaseRender) {
  const root = new THREE.Group();
  const fireplace = new THREE.Group();
  fireplace.name = 'war-room-fireplace';
  fireplace.position.set(-4.95, 0, 0);
  root.add(fireplace);

  const hans = new THREE.Group();
  hans.name = 'war-room-hans-butler';
  hans.visible = true;
  hans.position.set(-0.4, -0.34, 0.72);

  const refs = {};
  for (const key of ['leftLeg', 'rightLeg', 'torso', 'leftArm', 'rightArm', 'head', 'carriedLog', 'carriedPoker']) {
    refs[key] = new THREE.Group();
    hans.add(refs[key]);
  }
  refs.carriedLog.position.z = 0.22;
  refs.carriedPoker.position.z = 0.22;
  refs.carriedLog.visible = false;
  refs.carriedPoker.visible = false;
  hans.userData.refs = refs;
  fireplace.add(hans);

  const driver = new THREE.Group();
  driver.name = 'war-room-hans-fireplace-driver';
  driver.userData.warRoomHansPhase = 'idle';
  driver.onBeforeRender = onBaseRender;
  fireplace.add(driver);

  const door = new THREE.Group();
  door.name = 'war-room-hans-service-door';
  door.userData.refs = { side: -1, doorZ: 6 };
  const recess = new THREE.Group();
  recess.name = 'war-room-hans-service-door-recess';
  recess.position.x = -7.745;
  door.add(recess);
  root.add(door);

  return { root, hans, driver };
}

describe('Hans MotionPolish render hot path', () => {
  it('forwards native Three.js args directly and exposes reusable-frame diagnostics', () => {
    const seen = [];
    const { root, hans, driver } = makeMinimalRig((renderer, scene, camera, geometry, material, renderGroup) => {
      seen.push([renderer, scene, camera, geometry, material, renderGroup]);
    });

    expect(installWarRoomHansMotionPolish(root)).toBe(1);
    const args = Array.from({ length: 6 }, (_, index) => ({ index }));
    driver.onBeforeRender(...args);

    expect(seen).toEqual([args]);
    expect(driver.userData.warRoomHansMotionHotPath).toBe('scalar-position-reused-options-v1');
    expect(hans.userData.warRoomHansMotionHotPath).toBe('scalar-position-reused-options-v1');
  });
});
