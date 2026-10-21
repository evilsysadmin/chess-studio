import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  configureWarRoomBlenderLoader,
  createWarRoomBlenderVariantShell,
  deferWarRoomBlenderShadowPass,
  disposeWarRoomBlenderShellResources,
  installAuthoredPracticalLights,
  scheduleWarRoomAfterFirstPaint,
  selectWarRoomBlenderShadowCasters,
  shouldPrepareWarRoomShadowPass,
  WAR_ROOM_BLENDER_SHADOW_CASTER_LIMIT,
  warRoomBlenderPotentialShadowTriangles,
  warRoomBlenderPracticalLightProfile,
} from './WarRoomBlenderShellRuntime.js';

describe('War Room shared Blender runtime', () => {
  it('disposes shared GLB geometry and textures once across distinct materials and meshes', () => {
    const root = new THREE.Group();
    const geometry = new THREE.BoxGeometry();
    const texture = new THREE.Texture();
    const first = new THREE.MeshStandardMaterial({ map: texture });
    first.roughnessMap = texture;
    const second = new THREE.MeshStandardMaterial({ map: texture });
    root.add(new THREE.Mesh(geometry, first), new THREE.Mesh(geometry, second));
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const textureDispose = vi.spyOn(texture, 'dispose');
    const firstDispose = vi.spyOn(first, 'dispose');
    const secondDispose = vi.spyOn(second, 'dispose');

    disposeWarRoomBlenderShellResources(root);

    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(textureDispose).toHaveBeenCalledTimes(1);
    expect(firstDispose).toHaveBeenCalledTimes(1);
    expect(secondDispose).toHaveBeenCalledTimes(1);
    geometryDispose.mockRestore();
    textureDispose.mockRestore();
    firstDispose.mockRestore();
    secondDispose.mockRestore();
  });

  it('handles absent shell and indexed material arrays without double release', () => {
    expect(() => disposeWarRoomBlenderShellResources(null)).not.toThrow();
    const root = new THREE.Group();
    const geometry = new THREE.BufferGeometry();
    const one = new THREE.MeshBasicMaterial();
    const two = new THREE.MeshBasicMaterial();
    const node = new THREE.Mesh(geometry, one);
    node.material = [one, two, one];
    root.add(node);
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const oneDispose = vi.spyOn(one, 'dispose');
    const twoDispose = vi.spyOn(two, 'dispose');

    disposeWarRoomBlenderShellResources(root);

    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(oneDispose).toHaveBeenCalledTimes(1);
    expect(twoDispose).toHaveBeenCalledTimes(1);
    geometryDispose.mockRestore();
    oneDispose.mockRestore();
    twoDispose.mockRestore();
  });

  it('builds thin variant manifests from one shared shell factory', () => {
    expect(() => createWarRoomBlenderVariantShell()).toThrow(/requires id, model URL, root name and finish/i);
    const variant = createWarRoomBlenderVariantShell({
      variant: 'v9',
      runtimeModelUrl: 'https://assets.example.test/v9.glb',
      rootName: 'war-room-v9-shell',
      runtimeFinish: 'test-finish-v1',
    });

    expect(variant.modelUrl({ buildSha: 'abc 123' }))
      .toBe('https://assets.example.test/v9.glb?build=abc%20123');
    expect(Object.isFrozen(variant)).toBe(true);
    expect(typeof variant.install).toBe('function');
  });

  it('registers the bundled Meshopt decoder on the shared GLTF loader', () => {
    let decoder = null;
    const loader = {
      setMeshoptDecoder(value) {
        decoder = value;
        return this;
      },
    };

    expect(configureWarRoomBlenderLoader(loader)).toBe(loader);
    expect(decoder).toBeTruthy();
    expect(decoder.ready).toBeTruthy();
  });

  it('defers expensive shell refinement until after a paint and an idle turn', () => {
    let frame = null;
    let idle = null;
    let refinements = 0;
    const cancelled = [];
    const release = scheduleWarRoomAfterFirstPaint(
      () => { refinements += 1; },
      {
        requestFrame: (callback) => {
          frame = callback;
          return 11;
        },
        cancelFrame: (id) => cancelled.push(['frame', id]),
        requestIdle: (callback) => {
          idle = callback;
          return 22;
        },
        cancelIdle: (id) => cancelled.push(['idle', id]),
        setTimer: () => {
          throw new Error('timer fallback should not be used');
        },
      },
    );

    expect(refinements).toBe(0);
    frame();
    expect(refinements).toBe(0);
    idle();
    expect(refinements).toBe(1);
    release();
    expect(cancelled).toEqual([['frame', 11], ['idle', 22]]);
  });

  it('can cancel deferred shell refinement before the first paint completes', () => {
    let frame = null;
    let refinements = 0;
    const release = scheduleWarRoomAfterFirstPaint(
      () => { refinements += 1; },
      {
        requestFrame: (callback) => {
          frame = callback;
          return 7;
        },
        cancelFrame: () => {},
        requestIdle: () => {
          throw new Error('cancelled frame must not schedule idle work');
        },
      },
    );

    release();
    frame();
    expect(refinements).toBe(0);
  });

  it('preserves War Room default shadow preparation, but skips Hall no-shadow renderer', () => {
    expect(shouldPrepareWarRoomShadowPass()).toBe(true);
    expect(shouldPrepareWarRoomShadowPass({ coarsePointer: false, shadowMapsEnabled: true })).toBe(true);
    expect(shouldPrepareWarRoomShadowPass({ coarsePointer: true, shadowMapsEnabled: true })).toBe(false);
    expect(shouldPrepareWarRoomShadowPass({ coarsePointer: false, shadowMapsEnabled: false })).toBe(false);
    expect(shouldPrepareWarRoomShadowPass({ coarsePointer: true, shadowMapsEnabled: false })).toBe(false);
  });

  it('counts potential shell shadow triangles from indexed, nonindexed, shared and instanced geometry', () => {
    const indexed = new THREE.BoxGeometry(1, 1, 1); // 12 tris
    const nonindexed = indexed.toNonIndexed(); // still 12
    const shared = new THREE.Mesh(indexed, new THREE.MeshBasicMaterial());
    const another = new THREE.Mesh(indexed, new THREE.MeshBasicMaterial());
    const instances = new THREE.InstancedMesh(nonindexed, new THREE.MeshBasicMaterial(), 3);
    const empty = new THREE.Group();
    expect(warRoomBlenderPotentialShadowTriangles([shared, another, instances, empty])).toBe(60);
    expect(warRoomBlenderPotentialShadowTriangles([])).toBe(0);
    expect(warRoomBlenderPotentialShadowTriangles([
      { isMesh: true, geometry: { attributes: { position: { count: Number.NaN } } } },
    ])).toBe(0);
  });

  it('caps decorative Blender-shell shadow casters and prioritizes useful nearby geometry', () => {
    const makeMesh = ({ x, y = 1, z = 0, radius = 0.5, opacity = 1 } = {}) => ({
      isMesh: true,
      geometry: { boundingSphere: { radius } },
      material: { transparent: opacity < 1, opacity },
      getWorldPosition(target) {
        target.set(x, y, z);
        return target;
      },
      getWorldScale(target) {
        target.set(1, 1, 1);
        return target;
      },
    });
    const meshes = Array.from({ length: 64 }, (_, index) => makeMesh({
      x: index * 0.45,
      radius: index === 0 ? 1.1 : 0.45,
    }));

    const selected = selectWarRoomBlenderShadowCasters(meshes);
    expect(WAR_ROOM_BLENDER_SHADOW_CASTER_LIMIT).toBe(32);
    expect(selected).toHaveLength(32);
    expect(selected).toContain(meshes[0]);
    expect(selected).not.toContain(meshes[63]);
    expect(selectWarRoomBlenderShadowCasters(meshes, { limit: 0 })).toEqual([]);
  });

  it('reuses the two shadow census scratch vectors and keeps stable ranks across repeated passes', () => {
    const positions = new Set();
    const scales = new Set();
    const rows = Array.from({ length: 128 }, (_, index) => ({
      isMesh: true,
      geometry: { boundingSphere: { radius: index % 5 === 0 ? 0.9 : 0.4 } },
      material: index % 7 === 0
        ? [{ transparent: false, opacity: 1 }, { transparent: true, opacity: 0.5 }]
        : { transparent: false, opacity: 1 },
      getWorldPosition(target) {
        positions.add(target);
        return target.set(index * 0.22, index % 3, 0);
      },
      getWorldScale(target) {
        scales.add(target);
        return target.set(1, 1, 1);
      },
    }));
    const selected = selectWarRoomBlenderShadowCasters(rows);
    expect(selected).toHaveLength(WAR_ROOM_BLENDER_SHADOW_CASTER_LIMIT);
    expect(positions.size).toBe(1);
    expect(scales.size).toBe(1);
    expect(selectWarRoomBlenderShadowCasters(rows)).toEqual(selected);
    // A fresh census gets fresh scratch vectors without sharing mutable
    // positions across rooms or over asynchronous idle callbacks.
    expect(positions.size).toBe(2);
    expect(scales.size).toBe(2);
  });

  it('can census projected shadow casters without enabling shadows on lite/coarse profiles', () => {
    const meshes = Array.from({ length: 48 }, (_, index) => ({
      isMesh: true,
      geometry: { boundingSphere: { radius: 0.5 + (index === 0 ? 0.5 : 0) } },
      material: { transparent: false, opacity: 1 },
      getWorldPosition(target) {
        target.set(index * 0.25, 1, 0);
        return target;
      },
      getWorldScale(target) {
        target.set(1, 1, 1);
        return target;
      },
    }));

    const projected = selectWarRoomBlenderShadowCasters(meshes);
    expect(projected).toHaveLength(WAR_ROOM_BLENDER_SHADOW_CASTER_LIMIT);
    expect(projected).toContain(meshes[0]);
  });

  it('leaves first paint free of shadow ranking and runs the census once after idle', () => {
    let deferred = null;
    let matrixPasses = 0;
    let shadowScores = 0;
    let refinements = 0;
    const mesh = {
      isMesh: true,
      castShadow: false,
      geometry: { boundingSphere: { radius: 0.8 } },
      material: { transparent: false, opacity: 1 },
      getWorldPosition(target) {
        shadowScores += 1;
        return target.set(0, 1, 0);
      },
      getWorldScale(target) {
        return target.set(1, 1, 1);
      },
    };
    const root = {
      parent: {},
      userData: {
        warRoomBlenderShadowWarmup: 'deferred-after-first-paint',
        warRoomBlenderShadowProjectedCount: 0,
        warRoomBlenderShadowCasterCount: 0,
      },
      updateMatrixWorld() { matrixPasses += 1; },
    };
    deferWarRoomBlenderShadowPass({
      root,
      meshes: [mesh],
      onRefine: () => { refinements += 1; },
      schedule: (task) => {
        deferred = task;
        return () => {};
      },
    });

    expect(matrixPasses).toBe(0);
    expect(shadowScores).toBe(0);
    expect(mesh.castShadow).toBe(false);
    expect(root.userData.warRoomBlenderShadowProjectedCount).toBe(0);
    expect(refinements).toBe(0);

    deferred();
    expect(matrixPasses).toBe(1);
    expect(shadowScores).toBe(1);
    expect(mesh.castShadow).toBe(true);
    expect(root.userData.warRoomBlenderShadowWarmup).toBe('ready-budgeted');
    expect(root.userData.warRoomBlenderShadowProjectedCount).toBe(1);
    expect(root.userData.warRoomBlenderShadowCasterCount).toBe(1);
    // This synthetic mesh has no vertex accessor; do not invent triangles.
    expect(root.userData.warRoomBlenderShadowSelectedPotentialTriangles).toBe(0);
    expect(refinements).toBe(1);
  });

  it('does not rank shadows for a shell removed before its idle callback', () => {
    let deferred = null;
    const root = {
      parent: null,
      userData: { warRoomBlenderShadowWarmup: 'deferred-after-first-paint' },
      updateMatrixWorld() { throw new Error('detached shell should not update matrices'); },
    };
    deferWarRoomBlenderShadowPass({
      root,
      meshes: [],
      onRefine: () => { throw new Error('detached shell should not repaint'); },
      schedule: (task) => {
        deferred = task;
        return () => {};
      },
    });
    deferred();
    expect(root.userData.warRoomBlenderShadowWarmup).toBe('deferred-after-first-paint');
  });

  it('installs authored lights with one hierarchy traversal, preserving first duplicate anchor and specs', () => {
    const root = new THREE.Group();
    const fire = new THREE.Group();
    fire.name = 'WR_ANCHOR_fireplace_practical';
    const duplicate = new THREE.Group();
    duplicate.name = fire.name;
    const right = new THREE.Group();
    right.name = 'WR_ANCHOR_right_fireplace_practical';
    const chandelier = new THREE.Group();
    chandelier.name = 'WR_ANCHOR_chandelier_practical';
    const moon = new THREE.Group();
    moon.name = 'WR_ANCHOR_window_moonlight';
    const nested = new THREE.Group();
    nested.add(right, chandelier, moon);
    root.add(fire, duplicate, nested);

    let traversals = 0;
    const visit = root.traverse.bind(root);
    root.traverse = (callback) => { traversals += 1; return visit(callback); };
    root.getObjectByName = () => { throw new Error('recursive lookup is redundant'); };
    expect(installAuthoredPracticalLights(root)).toBe(4);
    expect(traversals).toBe(1);
    expect(fire.children[0]?.name).toBe('war-room-blender-fire-practical');
    expect(duplicate.children).toHaveLength(0);
    expect(right.children[0]?.name).toBe('war-room-blender-right-fire-practical');
    expect(chandelier.children[0]?.name).toBe('war-room-blender-chandelier-practical');
    expect(moon.children[0]?.name).toBe('war-room-blender-moon-practical');
    for (const anchor of [fire, right, chandelier, moon]) {
      const light = anchor.children[0];
      expect(light?.isPointLight).toBe(true);
      expect(light.castShadow).toBe(false);
      expect(light.userData.warRoomBlenderPractical).toBe(anchor.name);
    }
    expect(fire.children[0].intensity).toBeCloseTo(2.30);
    expect(moon.children[0].intensity).toBeCloseTo(3.42);
    expect(root.userData.warRoomBlenderPracticalLights).toBe(4);
  });

  it('skips disabled coarse-pointer chandelier and ignores duplicate missing anchors', () => {
    const root = new THREE.Group();
    const moon = new THREE.Group();
    moon.name = 'WR_ANCHOR_window_moonlight';
    const chandelier = new THREE.Group();
    chandelier.name = 'WR_ANCHOR_chandelier_practical';
    root.add(moon, chandelier);
    expect(installAuthoredPracticalLights(root, { coarsePointer: true })).toBe(1);
    expect(moon.children[0].intensity).toBeCloseTo(2.65);
    expect(chandelier.children).toHaveLength(0);
    expect(root.userData.warRoomBlenderPracticalLights).toBe(1);
  });

  it('keeps authored practicals cinematic and cheaper on coarse pointers', () => {
    const desktop = warRoomBlenderPracticalLightProfile();
    const coarse = warRoomBlenderPracticalLightProfile({ coarsePointer: true });
    expect(desktop.fire.color).toBe(0xff8a38);
    expect(desktop.rightFire.color).toBe(0xff7f30);
    expect(desktop.chandelier.color).toBe(0xffb457);
    expect(desktop.moon.color).toBe(0x7ba6ff);
    expect(desktop.fire.intensity).toBeGreaterThan(coarse.fire.intensity);
    expect(desktop.rightFire.intensity).toBeGreaterThan(coarse.rightFire.intensity);
    expect(desktop.chandelier.intensity).toBeGreaterThan(coarse.chandelier.intensity);
    expect(coarse.chandelier.intensity).toBe(0);
    expect(desktop.moon.intensity).toBeGreaterThan(coarse.moon.intensity);
    expect(desktop.rightFire.distance).toBeLessThan(desktop.fire.distance);
    expect(desktop.fire.distance).toBeLessThan(desktop.moon.distance);
    expect(desktop.fire.intensity).toBe(2.30);
    expect(desktop.fire.distance).toBe(10.8);
    expect(desktop.rightFire.intensity).toBe(1.68);
    expect(desktop.rightFire.distance).toBe(9.2);
    expect(desktop.chandelier.intensity).toBe(0.92);
    expect(desktop.chandelier.distance).toBe(7.8);
    expect(desktop.moon.intensity).toBe(3.42);
    expect(desktop.moon.distance).toBe(15.2);
    expect(coarse.fire.intensity).toBe(2.05);
    expect(coarse.rightFire.intensity).toBe(1.25);
    expect(coarse.moon.intensity).toBe(2.65);
  });
});
