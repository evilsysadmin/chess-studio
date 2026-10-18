import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { installWarRoomV3FireAnimation, warRoomV3FireFrame } from './WarRoomV3Fire.js';

describe('War Room V3/V4 hearth callback', () => {
  it.each([false, true])('forwards all six render args and restores the previous callback (reducedMotion=%s)', (reducedMotion) => {
    const root = new THREE.Group();
    const flame = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshStandardMaterial());
    flame.name = 'WR3_ARM_hearth_flame_body';
    const anchor = new THREE.Group();
    anchor.name = 'WR_ANCHOR_fireplace_practical';
    const practical = new THREE.PointLight(0xff8a38, 2.3);
    anchor.add(practical);
    root.add(flame, anchor);
    const original = vi.fn();
    flame.onBeforeRender = original;

    const release = installWarRoomV3FireAnimation(root, { reducedMotion });
    const renderer = { userData: { board3DMotionNowMs: 840 } };
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const args = [renderer, scene, camera, flame.geometry, flame.material, flame];

    flame.onBeforeRender(...args);
    expect(original).toHaveBeenCalledTimes(1);
    expect(original).toHaveBeenCalledWith(...args);
    expect(practical.intensity).toBeCloseTo(
      2.3 * warRoomV3FireFrame({ elapsedMs: 840, reducedMotion }).intensity, 12,
    );

    release();
    expect(flame.onBeforeRender).toBe(original);
    expect(practical.intensity).toBe(2.3);
    flame.geometry.dispose();
    flame.material.dispose();
  });
});
