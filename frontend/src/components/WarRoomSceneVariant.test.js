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

  it('paints the board before constructing a cold classic shell', () => {
    const shell = { visible: false };
    const scene = { userData: {} };
    const statuses = [];
    const scheduled = [];
    let builds = 0;
    let paints = 0;
    const controller = {
      current: () => [],
      ensure: () => {
        builds += 1;
        return [shell];
      },
    };

    const release = startWarRoomVariantScene({
      scene,
      classicShellController: controller,
      variant: 'classic',
      selectable: true,
      onStatus: (status) => statuses.push(status),
      onPaint: () => { paints += 1; },
      scheduleAfterFirstPaint: (task) => {
        scheduled.push(task);
        return () => {};
      },
    });

    expect(builds).toBe(0);
    expect(shell.visible).toBe(false);
    expect(scene.userData.warRoomRenderedVariant).toBe('classic');
    expect(statuses).toEqual(['idle']);
    expect(scheduled).toHaveLength(1);

    scheduled[0]();
    expect(builds).toBe(1);
    expect(shell.visible).toBe(true);
    expect(paints).toBe(1);
    expect(typeof release).toBe('function');
  });

  it('cancels a cold classic shell build when the scene leaves before first paint work runs', () => {
    const scene = { userData: {} };
    let scheduled = null;
    let cancelled = false;
    let builds = 0;
    const controller = {
      current: () => [],
      ensure: () => {
        builds += 1;
        return [{ visible: true }];
      },
    };

    const release = startWarRoomVariantScene({
      scene,
      classicShellController: controller,
      variant: 'classic',
      selectable: true,
      scheduleAfterFirstPaint: (task) => {
        scheduled = task;
        return () => { cancelled = true; };
      },
    });

    release();
    expect(cancelled).toBe(true);
    scheduled();
    expect(builds).toBe(0);
  });

  it('shows an already-built classic shell immediately without scheduling another build', () => {
    const shell = { visible: false };
    const scene = { userData: {} };
    let scheduled = 0;
    let paints = 0;
    const controller = {
      current: () => [shell],
      ensure: () => {
        throw new Error('already-built classic shell must not rebuild');
      },
    };

    startWarRoomVariantScene({
      scene,
      classicShellController: controller,
      variant: 'classic',
      selectable: true,
      onPaint: () => { paints += 1; },
      scheduleAfterFirstPaint: () => {
        scheduled += 1;
        return () => {};
      },
    });

    expect(shell.visible).toBe(true);
    expect(scheduled).toBe(0);
    expect(paints).toBe(1);
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
