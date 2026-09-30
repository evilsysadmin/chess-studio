import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  WAR_ROOM_V4_FLAME_NAMES,
  WAR_ROOM_V4_RUNTIME_MODEL_URL,
  tuneWarRoomV4PracticalLights,
  warRoomV4ModelUrl,
} from './WarRoomV4Shell.js';
import { WAR_ROOM_V3_RUNTIME_MODEL_URL } from './WarRoomV3Shell.js';
import { installWarRoomV3FireAnimation } from './WarRoomV3Fire.js';

describe('War Room v4 runtime shell', () => {
  it('owns a stable runtime alias separate from v3 (v3 stays the rollback)', () => {
    expect(WAR_ROOM_V4_RUNTIME_MODEL_URL).toContain('/war-room/v4/runtime/current.glb');
    expect(WAR_ROOM_V4_RUNTIME_MODEL_URL).not.toBe(WAR_ROOM_V3_RUNTIME_MODEL_URL);
    expect(warRoomV4ModelUrl({ buildSha: 'abc123' }))
      .toBe(`${WAR_ROOM_V4_RUNTIME_MODEL_URL}?build=abc123`);
  });

  it('drives the authored v4 fireplace flames with the shared flicker', () => {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ emissive: 0xff4b12 });
    for (const name of WAR_ROOM_V4_FLAME_NAMES) {
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.2), material);
      flame.name = name;
      root.add(flame);
    }
    const release = installWarRoomV3FireAnimation(root, { flameNames: WAR_ROOM_V4_FLAME_NAMES });
    const driver = root.getObjectByName('WR4_OBS_fireplace_flame_body');
    driver.onBeforeRender({ userData: { board3DMotionNowMs: 840 } });
    expect(driver.userData.warRoomV3FireDriver).toBe(true);
    expect(driver.scale.y).not.toBe(1);
    release();
    expect(driver.scale.y).toBe(1);
  });

  it('does not animate v3 flame names when asked for v4 ones', () => {
    const root = new THREE.Group();
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.2), new THREE.MeshStandardMaterial());
    flame.name = 'WR3_ARM_hearth_flame_body';
    root.add(flame);
    const release = installWarRoomV3FireAnimation(root, { flameNames: WAR_ROOM_V4_FLAME_NAMES });
    expect(flame.userData.warRoomV3FireDriver).toBeUndefined();
    release();
  });

  it('warms the existing practicals only and restores them on cleanup', () => {
    const root = new THREE.Group();
    const lantern = new THREE.PointLight(0xffb457, 0.92, 7.8, 2);
    lantern.name = 'war-room-blender-chandelier-practical';
    const fire = new THREE.PointLight(0xff8a38, 2.3, 10.8, 2);
    fire.name = 'war-room-blender-fire-practical';
    const moon = new THREE.PointLight(0x7ba6ff, 3.42, 15.2, 2);
    moon.name = 'war-room-blender-moon-practical';
    root.add(lantern, fire, moon);
    const lightsBefore = root.children.length;

    const release = tuneWarRoomV4PracticalLights(root);
    expect(root.children.length).toBe(lightsBefore);
    expect(lantern.intensity).toBeCloseTo(0.92 * 2.1);
    expect(lantern.distance).toBeCloseTo(7.8 * 1.5);
    expect(fire.intensity).toBeCloseTo(2.3 * 1.2);
    expect(moon.intensity).toBe(3.42);
    expect(root.userData.warRoomV4Lighting).toBe('warm-practicals-v1');

    release();
    expect(lantern.intensity).toBe(0.92);
    expect(lantern.distance).toBe(7.8);
    expect(fire.intensity).toBe(2.3);
    expect(root.userData.warRoomV4Lighting).toBeUndefined();
  });
});
