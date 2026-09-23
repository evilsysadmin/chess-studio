import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  WAR_ROOM_V3_RUNTIME_MODEL_URL,
  WAR_ROOM_V3_STAGING_MODEL_URL,
  installWarRoomV3FireAnimation,
  warRoomV3FireFrame,
  warRoomV3ModelUrl,
} from './WarRoomV3Shell.js';

describe('War Room v3 runtime asset URL', () => {
  it('owns a stable runtime alias separate from v2', () => {
    expect(WAR_ROOM_V3_RUNTIME_MODEL_URL).toContain('/war-room/v3/runtime/current.glb');
    expect(WAR_ROOM_V3_STAGING_MODEL_URL).toBe(WAR_ROOM_V3_RUNTIME_MODEL_URL);
    expect(warRoomV3ModelUrl({ buildSha: 'abc123' }))
      .toBe(`${WAR_ROOM_V3_RUNTIME_MODEL_URL}?build=abc123`);
  });

  it('keeps explicit query parameters and encodes the build token', () => {
    expect(warRoomV3ModelUrl({
      buildSha: 'main/abc 123',
      baseUrl: 'https://assets.example.test/current.glb?source=staging',
    })).toBe('https://assets.example.test/current.glb?source=staging&build=main%2Fabc%20123');
  });
});

describe('War Room v3 authored stove fire', () => {
  it('produces a restrained deterministic flicker and a static reduced-motion frame', () => {
    const first = warRoomV3FireFrame({ elapsedMs: 840 });
    expect(first).toEqual(warRoomV3FireFrame({ elapsedMs: 840 }));
    expect(first.height).toBeGreaterThan(0.85);
    expect(first.height).toBeLessThan(1.15);
    expect(first.intensity).toBeGreaterThan(0.82);
    expect(first.intensity).toBeLessThan(1.18);
    expect(warRoomV3FireFrame({ elapsedMs: 840, reducedMotion: true })).toEqual({
      width: 1,
      height: 1,
      depth: 1,
      lift: 0,
      intensity: 1,
    });
  });

  it('animates preserved flame nodes and restores them on cleanup', () => {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ emissive: 0xff4b12 });
    material.emissiveIntensity = 1.4;
    for (const name of [
      'WR3_OBS_stove_flame_body',
      'WR3_OBS_stove_flame_0',
      'WR3_OBS_stove_flame_1',
      'WR3_OBS_stove_flame_2',
    ]) {
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.2), material);
      flame.name = name;
      root.add(flame);
    }
    const anchor = new THREE.Group();
    anchor.name = 'WR_ANCHOR_fireplace_practical';
    const practical = new THREE.PointLight(0xff8a38, 2.3);
    const practicalColor = practical.color.getHex();
    anchor.add(practical);
    root.add(anchor);

    const driver = root.getObjectByName('WR3_OBS_stove_flame_body');
    const release = installWarRoomV3FireAnimation(root);
    driver.onBeforeRender({ userData: { board3DMotionNowMs: 840 } });

    expect(driver.userData.warRoomV3FireDriver).toBe(true);
    expect(driver.scale.y).not.toBe(1);
    expect(practical.intensity).not.toBe(2.3);
    expect(root.userData.warRoomV3FireAnimation).toBe('authored-flicker-v1');

    release();
    expect(driver.scale.toArray()).toEqual([1, 1, 1]);
    expect(practical.intensity).toBe(2.3);
    expect(practical.color.getHex()).toBe(practicalColor);
    expect(driver.userData.warRoomV3FireDriver).toBeUndefined();
    expect(root.userData.warRoomV3FireAnimation).toBeUndefined();
  });
});
