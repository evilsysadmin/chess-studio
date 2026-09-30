import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  WAR_ROOM_V4_FLAME_NAMES,
  WAR_ROOM_V4_RUNTIME_MODEL_URL,
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
    flame.name = 'WR3_OBS_stove_flame_body';
    root.add(flame);
    const release = installWarRoomV3FireAnimation(root, { flameNames: WAR_ROOM_V4_FLAME_NAMES });
    expect(flame.userData.warRoomV3FireDriver).toBeUndefined();
    release();
  });
});
