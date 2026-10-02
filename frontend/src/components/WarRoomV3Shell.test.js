import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  WAR_ROOM_V3_HEARTH_FIRE_SHAPE,
  WAR_ROOM_V3_TOUCH_HEARTH_WASH,
  WAR_ROOM_V3_TOUCH_TORCH_LIGHT,
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
    const spots = [
      [-8.28, 2.2], [8.28, 2.2],
      [-8.28, -1.0], [8.28, -1.0],
      [-8.28, -4.2], [8.28, -4.2],
    ];
    spots.forEach(([x, z], index) => {
      const anchor = new THREE.Object3D();
      anchor.name = `WR3_ANCHOR_torch_${index}`;
      anchor.position.set(x, 3.25, z);
      root.add(anchor);
    });
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
    expect(root.userData.warRoomV3Torches).toBe(6);
    const torch = root.getObjectByName('WR3_ANCHOR_torch_0').children[0];
    expect(torch.userData.warRoomTorchForm).toBe('gothic-wall-sconce-brazier');
    expect(lights(root)).toBe(6);
    // The torches lead the hall: well above the v1 gallery sconce (9.2).
    const torchLight = torch.getObjectByName('war-room-side-torch-light');
    expect(torchLight.intensity).toBeGreaterThan(2 * 9.2);
    release();
    expect(root.getObjectByName('WR3_ANCHOR_torch_0').children).toHaveLength(0);
    expect(root.userData.warRoomV3Torches).toBeUndefined();
  });

  it('keeps every flame but only one real torch light per side wall on touch devices', () => {
    const root = build();
    const release = installWarRoomV3Torches(root, { coarsePointer: true });
    expect(root.getObjectByName('war-room-side-torch-flame-outer')).toBeTruthy();
    expect(lights(root)).toBe(WAR_ROOM_V3_TOUCH_TORCH_LIGHT.maxLights);
    expect(root.userData.warRoomV3TouchTorchLights).toBe(2);
    const litAnchors = root.children
      .filter((anchor) => anchor.getObjectByName('war-room-side-torch-light'))
      .map((anchor) => anchor.name);
    expect(litAnchors).toEqual(['WR3_ANCHOR_torch_2', 'WR3_ANCHOR_torch_3']);
    const touchLight = root.getObjectByName('WR3_ANCHOR_torch_2')
      .getObjectByName('war-room-side-torch-light');
    expect(touchLight.intensity).toBeCloseTo(WAR_ROOM_V3_TOUCH_TORCH_LIGHT.intensity);
    expect(touchLight.distance).toBeCloseTo(WAR_ROOM_V3_TOUCH_TORCH_LIGHT.distance);
    release();
    expect(root.userData.warRoomV3TouchTorchLights).toBeUndefined();
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
    expect(scene.environmentIntensity).toBeCloseTo(0.28);
    // The desktop IBL writes its intensity after first paint: still scaled.
    scene.environmentIntensity = 0.46;
    expect(scene.environmentIntensity).toBeCloseTo(0.46 * 0.28);
    expect(root.getObjectByName('war-room-v3-board-pool')?.isSpotLight).toBe(true);

    release();
    expect(lantern.intensity).toBe(0.92);
    expect(fire.intensity).toBe(2.3);
    expect(hemi.intensity).toBe(1.35);
    expect(scene.environmentIntensity).toBe(0.46);
    expect(root.getObjectByName('war-room-v3-board-pool')).toBeUndefined();
  });

  it('lets the visible hearth and moonlight carry the touch portrait without global exposure', () => {
    const root = new THREE.Group();
    const fire = practical('war-room-blender-fire-practical', 2.05);
    const moon = practical('war-room-blender-moon-practical', 2.65);
    const lantern = practical('war-room-blender-chandelier-practical', 0.92);
    root.add(fire, moon, lantern);

    const release = tuneWarRoomV3Lighting(root, { coarsePointer: true });
    expect(fire.intensity).toBeCloseTo(2.05 * 2.05);
    expect(moon.intensity).toBeCloseTo(2.65 * 0.72);
    expect(lantern.intensity).toBe(0);

    release();
    expect(fire.intensity).toBe(2.05);
    expect(moon.intensity).toBe(2.65);
    expect(lantern.intensity).toBe(0.92);
  });

  it('projects one shadowless touch hearth wash from the authored fireplace toward the board', () => {
    const root = new THREE.Group();
    const hearthAnchor = new THREE.Object3D();
    hearthAnchor.name = 'WR_ANCHOR_fireplace_practical';
    root.add(hearthAnchor);

    const release = tuneWarRoomV3Lighting(root, { coarsePointer: true });
    const wash = hearthAnchor.getObjectByName('war-room-v3-touch-hearth-wash');
    const target = root.getObjectByName('war-room-v3-touch-hearth-target');

    expect(wash?.isSpotLight).toBe(true);
    expect(wash.intensity).toBe(WAR_ROOM_V3_TOUCH_HEARTH_WASH.intensity);
    expect(wash.distance).toBe(WAR_ROOM_V3_TOUCH_HEARTH_WASH.distance);
    expect(wash.castShadow).toBe(false);
    expect(wash.target).toBe(target);
    expect(target.position.toArray()).toEqual(WAR_ROOM_V3_TOUCH_HEARTH_WASH.target);

    release();
    expect(hearthAnchor.getObjectByName('war-room-v3-touch-hearth-wash')).toBeUndefined();
    expect(root.getObjectByName('war-room-v3-touch-hearth-target')).toBeUndefined();
  });

  it('keeps more shared fill on touch, where only two torches carry real light', () => {
    const scene = new THREE.Scene();
    const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
    scene.add(hemi);
    const root = new THREE.Group();
    const release = tuneWarRoomV3Lighting(root, { coarsePointer: true });
    scene.add(root);
    expect(hemi.intensity).toBeCloseTo(0.65);
    expect(root.getObjectByName('war-room-v3-board-pool')).toBeUndefined();
    release();
  });
});
