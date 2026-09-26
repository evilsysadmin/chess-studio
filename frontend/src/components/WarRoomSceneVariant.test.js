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
