import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  shouldShowClassicWarRoomShell,
  startWarRoomVariantScene,
  warRoomVariantShellCoarsePointer,
} from './WarRoomSceneVariant.js';

function createWarRoomClassicShellController({ build, eager = false } = {}) {
  let objects = [];
  let built = false;
  const ensure = () => {
    if (!built) {
      const result = build();
      objects = Array.isArray(result) ? result : result?.classicShellObjects || [];
      built = true;
    }
    return objects;
  };
  if (eager) ensure();
  return { ensure, current: () => objects, isBuilt: () => built };
}

describe('War Room shared scene variants', () => {
  it('never paints classic first when persisted v2 is available', () => {
    expect(shouldShowClassicWarRoomShell()).toBe(true);
    expect(shouldShowClassicWarRoomShell({ selectable: true, variant: 'v2' })).toBe(false);
    expect(shouldShowClassicWarRoomShell({ selectable: true, variant: 'v3' })).toBe(false);
    expect(shouldShowClassicWarRoomShell({ selectable: true, variant: 'classic' })).toBe(true);
    expect(shouldShowClassicWarRoomShell({ selectable: false, variant: 'v2' })).toBe(true);
  });

  it('treats real coarse-pointer devices as the cheap Blender-shell profile', () => {
    expect(warRoomVariantShellCoarsePointer({ coarsePointer: true, renderLite: false })).toBe(true);
    expect(warRoomVariantShellCoarsePointer({ coarsePointer: false, renderLite: true })).toBe(true);
    expect(warRoomVariantShellCoarsePointer({ coarsePointer: false, renderLite: false })).toBe(false);
  });

  it('does not construct the classic room for persisted v2 until fallback needs it', () => {
    let builds = 0;
    const shell = { name: 'classic-shell' };
    const controller = createWarRoomClassicShellController({
      eager: false,
      build: () => {
        builds += 1;
        return [shell];
      },
    });

    expect(controller.isBuilt()).toBe(false);
    expect(controller.current()).toEqual([]);
    expect(builds).toBe(0);

    expect(controller.ensure()).toEqual([shell]);
    expect(controller.ensure()).toEqual([shell]);
    expect(controller.isBuilt()).toBe(true);
    expect(builds).toBe(1);
  });

  it('keeps the classic shell visible through the shared scene controller', () => {
    const shell = { visible: false };
    const scene = { userData: {} };
    const statuses = [];
    const controller = {
      current: () => [shell],
      ensure: () => [shell],
    };

    const release = startWarRoomVariantScene({
      scene,
      classicShellController: controller,
      variant: 'classic',
      selectable: true,
      onStatus: (status) => statuses.push(status),
    });

    expect(shell.visible).toBe(true);
    expect(scene.userData.warRoomRenderedVariant).toBe('classic');
    expect(statuses).toEqual(['idle']);
    expect(typeof release).toBe('function');
  });

  it('reveals an asynchronously loaded classic shell without constructing it on the Blender path', async () => {
    const shell = { visible: false };
    const scene = { userData: {} };
    const statuses = [];
    let resolveShell;
    const pending = new Promise((resolve) => { resolveShell = resolve; });
    const controller = {
      current: () => [],
      ensure: () => pending,
    };

    const release = startWarRoomVariantScene({
      scene,
      classicShellController: controller,
      variant: 'classic',
      selectable: true,
      onStatus: (status) => statuses.push(status),
    });

    expect(scene.userData.warRoomRenderedVariant).toBe('classic-loading');
    expect(statuses).toEqual(['loading']);
    resolveShell([shell]);
    await pending;
    await Promise.resolve();

    expect(shell.visible).toBe(true);
    expect(scene.userData.warRoomRenderedVariant).toBe('classic');
    expect(statuses).toEqual(['loading', 'idle']);
    release();
  });

  it('does not download or install a GLB if unmounted during lazy module import', async () => {
    const canvas = { dataset: {} };
    const scene = { userData: {}, children: [] };
    let resolveImport;
    const deferredImport = new Promise((resolve) => { resolveImport = resolve; });
    let installerCalls = 0;
    let hansCalls = 0;
    let fallbackBuilds = 0;
    const release = startWarRoomVariantScene({
      scene,
      canvas,
      variant: 'v3',
      selectable: true,
      classicShellController: {
        current: () => [],
        ensure: () => { fallbackBuilds += 1; return []; },
      },
      loadVariantInstaller: () => deferredImport,
      loadHansStage: () => { hansCalls += 1; return Promise.resolve({}); },
    });

    expect(canvas.dataset.warRoomVariantStatus).toBe('loading');
    release();
    resolveImport(() => {
      installerCalls += 1;
      throw new Error('stale room must never request the GLB');
    });
    for (let n = 0; n < 8; n += 1) await Promise.resolve();

    expect(installerCalls).toBe(0);
    expect(hansCalls).toBe(0);
    expect(fallbackBuilds).toBe(0);
    expect(scene.userData.warRoomRenderedVariant).toBe('classic');
  });

  it('reports independent import, GLB, material, effect and ready-paint phases on the same canvas', async () => {
    const scene = { userData: {}, children: [{ userData: { warRoomVariant: 'v3' } }] };
    const canvas = { dataset: { warRoomShellTimingGlbMs: '999' } };
    const release = startWarRoomVariantScene({
      scene, classicShellController: { current: () => [] },
      variant: 'v3', selectable: true, canvas,
      onPaint: () => {},
      loadVariantInstaller: async () => async (target, options) => {
        expect(target).toBe(scene);
        options.onTiming('glb');
        options.onTiming('materials');
        options.onTiming('effects');
        return () => {};
      },
      loadHansStage: () => new Promise(() => {}),
    });
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
    for (const phase of ['Import', 'Glb', 'Materials', 'Effects', 'ReadyPaint']) {
      expect(canvas.dataset[`warRoomShellTiming${phase}Ms`]).toMatch(/^\d+$/);
    }
    expect(canvas.dataset.warRoomShellTimingGlbMs).not.toBe('999');
    expect(canvas.dataset.warRoomVariantStatus).toBe('ready');
    release();
  });

  it('parks an invisible V1 fireplace so Hans can mount in V4; restores V1 on return', async () => {
    const scene = new THREE.Scene();
    const legacy = new THREE.Group();
    legacy.name = 'premium-war-room-layer';
    const legacyFireplace = new THREE.Group();
    legacyFireplace.name = 'war-room-fireplace';
    legacy.add(legacyFireplace);
    legacy.userData.premiumWarRoom = true;
    scene.add(legacy);
    const controller = { current: () => [legacy], ensure: () => [legacy] };
    const canvas = { dataset: {} };
    let stageLookups = 0;
    const release = startWarRoomVariantScene({
      scene, classicShellController: controller, variant: 'v4', selectable: true,
      canvas,
      loadVariantInstaller: async () => (root) => {
        const shell = new THREE.Group();
        shell.userData.warRoomVariant = 'v4';
        root.add(shell);
        return () => shell.removeFromParent();
      },
      loadHansStage: async () => ({
        installWarRoomHansVariantStage: (root) => {
          stageLookups += 1;
          expect(root.getObjectByName('war-room-fireplace')).toBeUndefined();
          return { status: 'v4-tower-study:idle', release: () => {} };
        },
      }),
    });
    for (let i = 0; i < 12; i += 1) await Promise.resolve();

    expect(stageLookups).toBe(1);
    expect(legacy.parent).toBeNull();
    expect(canvas.dataset.warRoomHansStage).toBe('v4-tower-study:idle');
    release();
    expect(legacy.parent).toBe(scene);
    expect(legacy.visible).toBe(false);
    expect(scene.getObjectByName('war-room-fireplace')).toBe(legacyFireplace);
  });

  it('restores parked classic objects before revealing fallback on V4 shell error', async () => {
    const scene = new THREE.Scene();
    const legacy = new THREE.Group();
    scene.add(legacy);
    const canvas = { dataset: {} };
    const release = startWarRoomVariantScene({
      scene,
      classicShellController: { current: () => [legacy], ensure: () => [legacy] },
      variant: 'v4', selectable: true, canvas,
      loadVariantInstaller: async () => { throw new Error('offline GLB'); },
    });
    for (let i = 0; i < 12; i += 1) await Promise.resolve();
    expect(canvas.dataset.warRoomVariantStatus).toBe('fallback');
    expect(legacy.parent).toBe(scene);
    expect(legacy.visible).toBe(true);
    release();
  });

  it('marks a Blender room ready before loading Hans and installs him asynchronously', async () => {
    const scene = {
      userData: {},
      children: [{ userData: { warRoomVariant: 'v3' } }],
    };
    const canvas = { dataset: {} };
    const statuses = [];
    let resolveHansModule;
    let installs = 0;
    let paints = 0;
    const paintsAfterHans = () => paints;
    const pendingHans = new Promise((resolve) => { resolveHansModule = resolve; });

    const release = startWarRoomVariantScene({
      scene,
      classicShellController: { current: () => [] },
      variant: 'v3',
      selectable: true,
      canvas,
      onStatus: (status) => statuses.push(status),
      onPaint: () => { if (installs > 0) paints += 1; },
      loadVariantInstaller: async () => () => () => {},
      loadHansStage: () => pendingHans,
    });

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(statuses).toEqual(['loading', 'ready']);
    expect(scene.userData.warRoomRenderedVariant).toBe('v3');
    expect(canvas.dataset.warRoomHansStage).toBe('loading');
    expect(installs).toBe(0);

    resolveHansModule({
      installWarRoomHansVariantStage: () => {
        installs += 1;
        return { status: 'v3-armory-hall:idle', release: () => {} };
      },
    });
    await pendingHans;
    await Promise.resolve();
    await Promise.resolve();

    expect(installs).toBe(1);
    expect(canvas.dataset.warRoomHansStage).toBe('v3-armory-hall:idle');
    // Hans readiness requires two paints after his lazy driver exists; never
    // rely on unrelated post-install modules to trigger the second one.
    expect(paintsAfterHans()).toBeGreaterThanOrEqual(2);
    release();
  });

  it('does not install a late Hans stage after the Blender room unmounts', async () => {
    const scene = {
      userData: {},
      children: [{ userData: { warRoomVariant: 'v3' } }],
    };
    let resolveHansModule;
    let installs = 0;
    const pendingHans = new Promise((resolve) => { resolveHansModule = resolve; });

    const release = startWarRoomVariantScene({
      scene,
      classicShellController: { current: () => [] },
      variant: 'v3',
      selectable: true,
      loadVariantInstaller: async () => () => () => {},
      loadHansStage: () => pendingHans,
    });

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    release();

    resolveHansModule({
      installWarRoomHansVariantStage: () => {
        installs += 1;
        return { status: 'unexpected', release: () => {} };
      },
    });
    await pendingHans;
    await Promise.resolve();
    await Promise.resolve();

    expect(installs).toBe(0);
  });

  it('keeps classic eager behavior when the classic variant is actually active', () => {
    let builds = 0;
    const controller = createWarRoomClassicShellController({
      eager: true,
      build: () => {
        builds += 1;
        return [{ name: 'classic-shell' }];
      },
    });

    expect(controller.isBuilt()).toBe(true);
    expect(controller.current()).toHaveLength(1);
    expect(builds).toBe(1);
  });
});
