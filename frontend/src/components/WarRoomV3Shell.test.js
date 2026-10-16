import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createWarRoomSideTorch } from './WarRoomMilitaryGallery.js';
import { warRoomVariantRuntimeModelUrl } from './WarRoomVariant.js';
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
  it('preloads the actual authored V3 GLB with the exact same build URL as the installer', () => {
    const expected = warRoomVariantRuntimeModelUrl('v3', { buildSha: 'abc123' });
    expect(WAR_ROOM_V3_RUNTIME_MODEL_URL).toContain('/war-room/v3/runtime/current.glb');
    expect(expected).toBe(`${WAR_ROOM_V3_RUNTIME_MODEL_URL}?build=abc123`);
    expect(warRoomV3ModelUrl({ buildSha: 'abc123' })).toBe(expected);
    expect(warRoomV3ModelUrl({ buildSha: 'new-deploy' }))
      .toBe(warRoomVariantRuntimeModelUrl('v3', { buildSha: 'new-deploy' }));
    expect(warRoomV3ModelUrl({ buildSha: '' })).toBe(WAR_ROOM_V3_RUNTIME_MODEL_URL);
  });

  it('preserves URL queries when adding build tokens', () => {
    const url = 'https://assets.example.test/war-room/v3/runtime/current.glb?source=staging';
    expect(warRoomV3ModelUrl({ buildSha: 'main/abc 123', baseUrl: url }))
      .toBe(`${url}&build=main%2Fabc%20123`);
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

  it('instances V3 static torch metal without changing geometry, transforms or animated flames', () => {
    const root = build();
    const release = installWarRoomV3Torches(root);
    const batchedTorch = root.getObjectByName('WR3_ANCHOR_torch_0').children[0];
    const classicTorch = createWarRoomSideTorch({ withLight: false });
    const families = [
      ['war-room-side-torch-rivet', 3],
      ['war-room-side-torch-cage-bar', 6],
      ['war-room-side-torch-crown-spike', 6],
      ['war-room-side-torch-backplate-finial', 2],
    ];
    for (const [name, count] of families) {
      const original = classicTorch.children.filter((child) => child.name === name);
      const batch = batchedTorch.getObjectByName(name);
      expect(original).toHaveLength(count);
      expect(batch?.isInstancedMesh).toBe(true);
      expect(batch.count).toBe(count);
      expect(batch.material).toBeTruthy();
      expect(batch.castShadow).toBe(false);
      expect(batch.receiveShadow).toBe(true);
      original.forEach((node, index) => {
        node.updateMatrix();
        const instance = new THREE.Matrix4();
        batch.getMatrixAt(index, instance);
        instance.elements.forEach((value, offset) => {
          expect(value).toBeCloseTo(node.matrix.elements[offset], 5);
        });
        expect(batch.geometry.type).toBe(node.geometry.type);
        expect(batch.geometry.parameters).toEqual(node.geometry.parameters);
      });
    }
    const meshCount = (group) => {
      let count = 0;
      group.traverse((node) => { if (node.isMesh) count += 1; });
      return count;
    };
    expect(meshCount(classicTorch) - meshCount(batchedTorch)).toBe(13);
    expect(Boolean(batchedTorch.getObjectByName('war-room-side-torch-flame-outer')?.isInstancedMesh)).toBe(false);
    expect(Boolean(batchedTorch.getObjectByName('war-room-side-torch-wall-halo')?.isInstancedMesh)).toBe(false);
    release();
  });

  it('shares only the four static GPU geometries across V3 sconces and disposes once', () => {
    const root = build();
    const release = installWarRoomV3Torches(root);
    const disposalSpies = [];
    const firstMountRivetGeometry = root.getObjectByName('war-room-side-torch-rivet').geometry;
    for (const name of [
      'war-room-side-torch-rivet',
      'war-room-side-torch-cage-bar',
      'war-room-side-torch-crown-spike',
      'war-room-side-torch-backplate-finial',
    ]) {
      const geometryByTorch = root.children.map((anchor) => (
        anchor.children[0].getObjectByName(name)?.geometry
      ));
      expect(geometryByTorch).toHaveLength(6);
      expect(geometryByTorch.every((geometry) => geometry === geometryByTorch[0])).toBe(true);
      expect(geometryByTorch[0]).toBeTruthy();
      const dispose = vi.spyOn(geometryByTorch[0], 'dispose');
      // Every torch retains its own instanced node for accurate culling.
      expect(new Set(root.children.map((anchor) => anchor.children[0].getObjectByName(name))).size).toBe(6);
      expect(root.children.every((anchor) => anchor.children[0].getObjectByName(name).isInstancedMesh)).toBe(true);
      disposalSpies.push(dispose);
    }
    release();
    expect(disposalSpies.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    const nextRoot = build();
    const nextRelease = installWarRoomV3Torches(nextRoot);
    expect(nextRoot.getObjectByName('war-room-side-torch-rivet').geometry)
      .not.toBe(firstMountRivetGeometry);
    nextRelease();
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
    expect(moon.intensity).toBeCloseTo(2.65 * 0.82);
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
