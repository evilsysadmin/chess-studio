import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  WAR_ROOM_V3_HEARTH_FIRE_SHAPE,
  installWarRoomV3Torches,
  tuneWarRoomV3Lighting,
  WAR_ROOM_V3_RUNTIME_MODEL_URL,
  warRoomV3ModelUrl,
} from './WarRoomV3Shell.js';

describe('War Room v3 runtime asset URL', () => {
  it('owns a stable runtime alias separate from v2', () => {
    expect(WAR_ROOM_V3_RUNTIME_MODEL_URL).toContain('/war-room/v3/runtime/current.glb');
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

describe('War Room v3 armory hearth fire', () => {
  it('burns wider and taller than the retired observatory stove', () => {
    expect(WAR_ROOM_V3_HEARTH_FIRE_SHAPE.spreadX).toBeGreaterThan(0.3);
    expect(WAR_ROOM_V3_HEARTH_FIRE_SHAPE.height).toBeGreaterThan(0.55);
  });
});

describe('War Room v3 side-wall torches', () => {
  const build = () => {
    const root = new THREE.Group();
    for (const [name, x] of [['WR3_ANCHOR_torch_0', -8.28], ['WR3_ANCHOR_torch_1', 8.28]]) {
      const anchor = new THREE.Object3D();
      anchor.name = name;
      anchor.position.x = x;
      root.add(anchor);
    }
    return root;
  };
  const lights = (root) => {
    let count = 0;
    root.traverse((node) => { if (node.isPointLight) count += 1; });
    return count;
  };

  it('mounts the v1 sconce-brazier on every authored anchor and removes it on cleanup', () => {
    const root = build();
    const release = installWarRoomV3Torches(root);
    expect(root.userData.warRoomV3Torches).toBe(2);
    const torch = root.getObjectByName('WR3_ANCHOR_torch_0').children[0];
    expect(torch.userData.warRoomTorchForm).toBe('gothic-wall-sconce-brazier');
    expect(lights(root)).toBe(2);
    release();
    expect(root.getObjectByName('WR3_ANCHOR_torch_0').children).toHaveLength(0);
    expect(root.userData.warRoomV3Torches).toBeUndefined();
  });

  it('keeps flames but no real lights on touch devices', () => {
    const root = build();
    const release = installWarRoomV3Torches(root, { coarsePointer: true });
    expect(root.getObjectByName('war-room-side-torch-flame-outer')).toBeTruthy();
    expect(lights(root)).toBe(0);
    release();
  });
});

describe('War Room v3 torchlit grade', () => {
  const practical = (name, intensity) => {
    const light = new THREE.PointLight(0xffffff, intensity);
    light.name = name;
    return light;
  };

  it('drops the lantern, heats the hearth and dims the shared fill until cleanup', () => {
    const scene = new THREE.Scene();
    const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1.35);
    scene.add(hemi);
    scene.environmentIntensity = 1;
    const root = new THREE.Group();
    const lantern = practical('war-room-blender-chandelier-practical', 0.92);
    const fire = practical('war-room-blender-fire-practical', 2.3);
    root.add(lantern, fire);

    const release = tuneWarRoomV3Lighting(root);
    expect(lantern.intensity).toBe(0);
    expect(fire.intensity).toBeCloseTo(2.3 * 1.35);
    expect(hemi.intensity).toBe(1.35);
    scene.add(root);
    expect(hemi.intensity).toBeCloseTo(1.35 * 0.4);
    expect(scene.environmentIntensity).toBeCloseTo(0.5);

    release();
    expect(lantern.intensity).toBe(0.92);
    expect(fire.intensity).toBe(2.3);
    expect(hemi.intensity).toBe(1.35);
    expect(scene.environmentIntensity).toBe(1);
  });

  it('keeps more fill on touch, where the torches carry no real light', () => {
    const scene = new THREE.Scene();
    const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
    scene.add(hemi);
    const root = new THREE.Group();
    const release = tuneWarRoomV3Lighting(root, { coarsePointer: true });
    scene.add(root);
    expect(hemi.intensity).toBeCloseTo(0.65);
    release();
  });
});
