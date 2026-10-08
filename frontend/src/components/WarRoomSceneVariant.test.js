import { describe, expect, it } from 'vitest';
import { createWarRoomClassicShellController } from './WarRoomClassicShell.js';
import {
  shouldShowClassicWarRoomShell,
  startWarRoomVariantScene,
  warRoomVariantShellCoarsePointer,
} from './WarRoomSceneVariant.js';

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
