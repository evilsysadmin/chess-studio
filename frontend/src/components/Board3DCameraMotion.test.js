import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  applyBoard3DCameraMotion,
  resetBoard3DMobilePan,
  setBoard3DMobilePan,
} from './Board3DCameraMotion.js';

describe('Board3D mobile camera pan', () => {
  it('maps bounded two-finger pan into room-space translation', () => {
    const motion = { x: 0, y: 0, yaw: 0, pitch: 0 };
    setBoard3DMobilePan(motion, { x: 4, y: -4 }, true);
    expect(motion.x).toBeCloseTo(-2.2);
    expect(motion.y).toBeCloseTo(-1.55);

    resetBoard3DMobilePan(motion);
    expect(motion).toMatchObject({ x: 0, y: 0 });
  });

  it('keeps black-side vertical pan natural by mirroring the board axis', () => {
    const white = { x: 0, y: 0 };
    const black = { x: 0, y: 0 };
    setBoard3DMobilePan(white, { x: 0, y: .5 }, true);
    setBoard3DMobilePan(black, { x: 0, y: .5 }, false);
    expect(white.y).toBeCloseTo(-black.y);
  });

  it('translates camera and target together without changing viewing distance', () => {
    const camera = new THREE.PerspectiveCamera(40, 1, .1, 100);
    camera.userData.basePosition = new THREE.Vector3(0, 10, 9);
    camera.userData.baseTarget = new THREE.Vector3(0, 0, 0);
    camera.position.copy(camera.userData.basePosition);
    const beforeDistance = camera.position.distanceTo(camera.userData.baseTarget);
    const motion = { x: 1.2, y: -.8, yaw: 0, pitch: 0 };

    expect(applyBoard3DCameraMotion(camera, motion)).toBe(true);

    const shiftedTarget = new THREE.Vector3(1.2, 0, -.8);
    expect(camera.position.distanceTo(shiftedTarget)).toBeCloseTo(beforeDistance, 6);
    expect(camera.position.x).toBeCloseTo(1.2, 6);
    expect(camera.position.z).toBeCloseTo(8.2, 6);
  });
});
