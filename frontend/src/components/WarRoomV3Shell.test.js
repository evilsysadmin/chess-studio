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
  it('prefetches the identical Hans-ready content-addressed GLB with no build token', () => {
    const expected = warRoomVariantRuntimeModelUrl('v3', { buildSha: 'abc123' });
    expect(expected).toBe('https://assets.chess-studio.shadowops.dpdns.org/war-room/v3/runtime/war-room-v3-shell-0df589c2fa839a26.glb');
    expect(WAR_ROOM_V3_RUNTIME_MODEL_URL).toBe(expected);
    expect(warRoomV3ModelUrl({ buildSha: 'abc123' })).toBe(expected);
    expect(warRoomV3ModelUrl({ buildSha: 'new-deploy' })).toBe(expected);
    expect(warRoomV3ModelUrl({ buildSha: '' })).toBe(expected);
  });

  it('never build-busts an explicit immutable GLB URL with existing queries', () => {
    const url = 'https://assets.example.test/war-room/v3/runtime/shell-0123456789abcdef.glb?source=staging';
    expect(warRoomV3ModelUrl({ buildSha: 'main/abc 123', baseUrl: url })).toBe(url);
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

  it('merges eleven static metal families and one additive halo across all six desktop torches', () => {
    const root = build();
    // Authored anchors are rotated in the GLB; the merge must respect the
    // complete nested transform, including a transform on the scene root.
    root.position.set(2, -1, 4);
    root.rotation.y = 0.27;
    root.children[0].rotation.y = Math.PI / 2;
    root.children[3].rotation.y = -Math.PI / 2;
    const anchors = [...root.children];
    const release = installWarRoomV3Torches(root);
    const original = createWarRoomSideTorch({ withLight: false });
    const families = [
      ['war-room-side-torch-rivet', 3],
      ['war-room-side-torch-cage-bar', 6],
      ['war-room-side-torch-crown-spike', 6],
      ['war-room-side-torch-backplate-finial', 2],
      ['war-room-side-torch-backplate', 1],
      ['war-room-side-torch-wall-arm', 1],
      ['war-room-side-torch-arm-collar', 1],
      ['war-room-side-torch-neck', 1],
      ['war-room-side-torch-brazier-bowl', 1],
      ['war-room-side-torch-brazier-rim', 1],
      ['war-room-side-torch-embers', 1],
      ['war-room-side-torch-wall-halo', 1],
    ];
    expect(root.userData.warRoomV3StaticTorchBatches).toBe(12);
    for (const [name, perTorch] of families) {
      const batch = root.children.find((child) => child.name === name);
      const classic = original.children.filter((child) => child.name === name);
      expect(classic).toHaveLength(perTorch);
      expect(batch?.isInstancedMesh).toBe(true);
      expect(batch.userData.warRoomV3MergedTorchHardware).toBe(true);
      expect(batch.count).toBe(perTorch * 6);
      expect(batch.castShadow).toBe(classic[0].castShadow);
      expect(batch.receiveShadow).toBe(classic[0].receiveShadow);
      expect(batch.renderOrder).toBe(classic[0].renderOrder);
      for (let anchorIndex = 0; anchorIndex < anchors.length; anchorIndex += 1) {
        const anchor = anchors[anchorIndex];
        anchor.updateMatrix();
        expect(anchor.children[0].getObjectByName(name)).toBeUndefined();
        for (let index = 0; index < perTorch; index += 1) {
          classic[index].updateMatrix();
          const expected = new THREE.Matrix4().multiplyMatrices(anchor.matrix, classic[index].matrix);
          const actual = new THREE.Matrix4();
          batch.getMatrixAt(anchorIndex * perTorch + index, actual);
          actual.elements.forEach((value, offset) => {
            expect(value).toBeCloseTo(expected.elements[offset], 5);
          });
          expect(batch.geometry.type).toBe(classic[index].geometry.type);
          expect(batch.geometry.parameters).toEqual(classic[index].geometry.parameters);
        }
      }
    }
    expect(root.children.filter((node) => node.isInstancedMesh)).toHaveLength(12);
    // Animated fire retains its independent nodes and callbacks; wall glows share one map.
    for (const anchor of anchors) {
      expect(anchor.getObjectByName('war-room-side-torch-flame-outer')?.isMesh).toBe(true);
      expect(anchor.getObjectByName('war-room-side-torch-flame-inner')?.isMesh).toBe(true);
      expect(anchor.getObjectByName('war-room-side-torch-wall-halo')).toBeUndefined();
    }
    release();
    expect(root.children).toEqual(anchors);
    expect(root.userData.warRoomV3StaticTorchBatches).toBeUndefined();
  });

  it('owns fifteen GPU shapes per V3 hall, disposes once and re-creates on remount', () => {
    const root = build();
    const anchors = [...root.children];
    const release = installWarRoomV3Torches(root);
    const original = createWarRoomSideTorch({ withLight: false });
    const staticNames = [
      'war-room-side-torch-rivet', 'war-room-side-torch-cage-bar',
      'war-room-side-torch-crown-spike', 'war-room-side-torch-backplate-finial',
      'war-room-side-torch-backplate', 'war-room-side-torch-wall-arm',
      'war-room-side-torch-arm-collar', 'war-room-side-torch-neck',
      'war-room-side-torch-brazier-bowl', 'war-room-side-torch-brazier-rim',
      'war-room-side-torch-embers', 'war-room-side-torch-wall-halo',
    ];
    const names = [
      ...staticNames,
      'war-room-side-torch-flame-outer',
      'war-room-side-torch-flame-side', 'war-room-side-torch-flame-inner',
    ];
    const disposalSpies = [];
    const initialFlameGeometry = root.getObjectByName('war-room-side-torch-flame-outer').geometry;
    for (const name of names) {
      const batched = staticNames.includes(name);
      const nodes = batched
        ? [root.children.find((node) => node.name === name)]
        : anchors.map((anchor) => anchor.children[0].getObjectByName(name));
      expect(nodes.length).toBe(batched ? 1 : 6);
      expect(nodes.every((node) => node?.geometry === nodes[0].geometry)).toBe(true);
      expect(nodes[0].geometry.type).toBe(original.getObjectByName(name).geometry.type);
      expect(nodes[0].geometry.parameters).toEqual(original.getObjectByName(name).geometry.parameters);
      disposalSpies.push(vi.spyOn(nodes[0].geometry, 'dispose'));
    }

    const flames = anchors.map((anchor) => (
      anchor.getObjectByName('war-room-side-torch-flame-outer')
    ));
    expect(flames.every((mesh) => !mesh.isInstancedMesh)).toBe(true);
    expect(new Set(flames.map((mesh) => mesh.material)).size).toBe(6);
    expect(new Set(flames.map((mesh) => mesh.onBeforeRender)).size).toBe(6);
    const halo = root.children.find((node) => node.name === 'war-room-side-torch-wall-halo');
    expect(halo?.isInstancedMesh).toBe(true);
    expect(halo?.material?.map?.userData?.warRoomTorchHalo).toBe('radial-amber-v1');
    expect(halo.material.blending).toBe(THREE.AdditiveBlending);
    expect(halo.material.transparent).toBe(true);
    expect(halo.renderOrder).toBe(1);
    const haloTextureDispose = vi.spyOn(halo.material.map, 'dispose');
    const allGeometries = new Set();
    root.traverse((node) => { if (node.geometry) allGeometries.add(node.geometry); });
    expect(allGeometries.size).toBe(names.length);

    release();
    expect(disposalSpies.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(haloTextureDispose).toHaveBeenCalledTimes(1);
    expect(root.children).toEqual(anchors);
    expect(anchors.every((anchor) => anchor.children.length === 0)).toBe(true);
    const secondRoot = build();
    const secondRelease = installWarRoomV3Torches(secondRoot);
    expect(secondRoot.getObjectByName('war-room-side-torch-flame-outer').geometry)
      .not.toBe(initialFlameGeometry);
    secondRelease();
  });

  it('still merges static hardware for a lite software-rendered desktop', () => {
    const root = build();
    const release = installWarRoomV3Torches(root, {
      coarsePointer: true, touchHardwareCulling: false,
    });
    expect(root.userData.warRoomV3StaticTorchBatches).toBe(12);
    expect(root.userData.warRoomV3TouchTorchLights).toBe(2);
    const hardware = root.children.filter((node) => node.userData.warRoomV3MergedTorchHardware);
    expect(hardware).toHaveLength(12);
    // Render-lite and real touch are independent: the real touch path below
    // gets two wall zones; the desktop still consolidates the full hall.
    release();
    expect(root.children).toHaveLength(6);
  });

  it('batches touch metal by wall without merging flames, halos or lights across walls', () => {
    const root = build();
    const anchors = [...root.children];
    const release = installWarRoomV3Torches(root, { coarsePointer: true, touchHardwareCulling: true });
    expect(root.getObjectByName('war-room-side-torch-flame-outer')).toBeTruthy();
    expect(lights(root)).toBe(WAR_ROOM_V3_TOUCH_TORCH_LIGHT.maxLights);
    expect(root.userData.warRoomV3TouchTorchLights).toBe(2);
    // The eleven untextured metal/ember families get one batch per wall.
    // Halo maps are deliberately unique on touch and cannot be combined.
    expect(root.userData.warRoomV3StaticTorchBatches).toBe(22);
    const batches = root.children.filter((node) => node.userData.warRoomV3MergedTorchHardware);
    expect(batches).toHaveLength(22);
    expect(batches.filter((batch) => batch.userData.warRoomV3TorchZone === 'left')).toHaveLength(11);
    expect(batches.filter((batch) => batch.userData.warRoomV3TorchZone === 'right')).toHaveLength(11);
    for (const zone of ['left', 'right']) {
      const cage = batches.find((batch) => (
        batch.userData.warRoomV3TorchZone === zone
        && batch.name === 'war-room-side-torch-cage-bar'
      ));
      expect(cage?.isInstancedMesh).toBe(true);
      expect(cage.count).toBe(18);
      const bounds = new THREE.Box3().setFromObject(cage);
      expect(Math.sign(bounds.getCenter(new THREE.Vector3()).x)).toBe(zone === 'left' ? -1 : 1);
    }
    expect(anchors.every((anchor) => (
      anchor.getObjectByName('war-room-side-torch-cage-bar') == null
    ))).toBe(true);
    const touchHalos = anchors.map((anchor) => anchor.getObjectByName('war-room-side-torch-wall-halo'));
    expect(touchHalos.every((halo) => Boolean(halo?.material?.map))).toBe(true);
    expect(new Set(touchHalos.map((halo) => halo.material.map)).size).toBe(6);
    const flameOuters = anchors.map((anchor) => anchor.getObjectByName('war-room-side-torch-flame-outer'));
    expect(new Set(flameOuters.map((mesh) => mesh.onBeforeRender)).size).toBe(6);
    const litAnchors = anchors
      .filter((anchor) => anchor.getObjectByName('war-room-side-torch-light'))
      .map((anchor) => anchor.name);
    expect(litAnchors).toEqual(['WR3_ANCHOR_torch_2', 'WR3_ANCHOR_torch_3']);
    const touchLight = root.getObjectByName('WR3_ANCHOR_torch_2')
      .getObjectByName('war-room-side-torch-light');
    expect(touchLight.intensity).toBeCloseTo(WAR_ROOM_V3_TOUCH_TORCH_LIGHT.intensity);
    expect(touchLight.distance).toBeCloseTo(WAR_ROOM_V3_TOUCH_TORCH_LIGHT.distance);
    release();
    expect(root.children).toEqual(anchors);
    expect(anchors.every((anchor) => anchor.children.length === 0)).toBe(true);
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
