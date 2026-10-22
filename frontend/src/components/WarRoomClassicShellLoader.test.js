import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { classicShellModuleKind, createClassicWarRoomShellController, createLazyClassicWarRoomShellController } from './WarRoomClassicShellLoader.js';

describe('lazy classic War Room shell controller', () => {
  it('routes classroom bootstrap to the dedicated School Room module', () => {
    expect(classicShellModuleKind({ classroom: true })).toBe('school-room-dedicated-v1');
    expect(classicShellModuleKind({ classroom: false })).toBe('war-room-classic-v1');
  });

  it('does not load the procedural shell until classic or fallback actually needs it', async () => {
    const shell = { name: 'classic-shell' };
    const buildClassicWarRoomShell = vi.fn(() => ({ classicShellObjects: [shell] }));
    const loadModule = vi.fn(async () => ({ buildClassicWarRoomShell }));
    const onBuilt = vi.fn();
    const controller = createLazyClassicWarRoomShellController(
      { scene: {}, boardGroup: {} },
      { loadModule, onBuilt },
    );

    expect(controller.current()).toEqual([]);
    expect(controller.isBuilt()).toBe(false);
    expect(controller.isLoading()).toBe(false);
    expect(loadModule).not.toHaveBeenCalled();

    const first = controller.ensure();
    const second = controller.ensure();
    expect(first).toBe(second);
    expect(controller.isLoading()).toBe(true);
    expect(loadModule).not.toHaveBeenCalled();

    await expect(first).resolves.toEqual([shell]);
    expect(loadModule).toHaveBeenCalledTimes(1);
    expect(buildClassicWarRoomShell).toHaveBeenCalledTimes(1);
    expect(controller.current()).toEqual([shell]);
    expect(controller.isBuilt()).toBe(true);
    expect(controller.ensure()).toEqual([shell]);
    expect(onBuilt).toHaveBeenCalledWith([shell]);
  });

  it('starts the lazy import eagerly only when the caller explicitly requests classic', async () => {
    let resolveModule;
    const loadModule = vi.fn(() => new Promise((resolve) => { resolveModule = resolve; }));
    const controller = createLazyClassicWarRoomShellController(
      {},
      { eager: true, loadModule },
    );

    await Promise.resolve();
    expect(loadModule).toHaveBeenCalledTimes(1);
    expect(controller.isLoading()).toBe(true);

    resolveModule({ buildClassicWarRoomShell: () => ({ classicShellObjects: [] }) });
    await controller.ensure();
    expect(controller.isBuilt()).toBe(true);
  });

  it('does not construct a classic room if its chunk resolves after unmount', async () => {
    let resolveModule;
    const buildClassicWarRoomShell = vi.fn(() => ({ classicShellObjects: [{ name: 'late-shell' }] }));
    const loadModule = vi.fn(() => new Promise((resolve) => { resolveModule = resolve; }));
    const controller = createLazyClassicWarRoomShellController({}, { loadModule });

    const pending = controller.ensure();
    await Promise.resolve();
    expect(loadModule).toHaveBeenCalledTimes(1);

    controller.dispose();
    expect(controller.isDisposed()).toBe(true);
    expect(controller.isLoading()).toBe(false);
    resolveModule({ buildClassicWarRoomShell });

    await expect(pending).resolves.toEqual([]);
    expect(buildClassicWarRoomShell).not.toHaveBeenCalled();
    expect(controller.current()).toEqual([]);
  });

  it('can retry a transient chunk failure instead of poisoning fallback forever', async () => {
    const shell = { name: 'classic-shell' };
    const loadModule = vi.fn()
      .mockRejectedValueOnce(new Error('chunk failed'))
      .mockResolvedValueOnce({
        buildClassicWarRoomShell: () => ({ classicShellObjects: [shell] }),
      });
    const controller = createLazyClassicWarRoomShellController({}, { loadModule });

    await expect(controller.ensure()).rejects.toThrow('chunk failed');
    expect(controller.isBuilt()).toBe(false);
    await expect(controller.ensure()).resolves.toEqual([shell]);
    expect(loadModule).toHaveBeenCalledTimes(2);
  });
  it('publishes a one-shot classic geometry census without measuring classroom meshes', async () => {
    const group = new THREE.Group();
    const cube = new THREE.BoxGeometry(1, 1, 1); // 12 triangles
    group.add(new THREE.Mesh(cube, new THREE.MeshBasicMaterial()));
    const canvas = { dataset: {}, isConnected: true };
    const loadModule = vi.fn(async () => ({
      buildClassicWarRoomShell: () => ({ classicShellObjects: [group] }),
    }));

    const controller = createClassicWarRoomShellController(
      { canvas, scene: {}, boardGroup: {} }, false, { loadModule },
    );
    await controller.ensure();
    expect(canvas.dataset.warRoomClassicPotentialTriangles).toBe('12');
    expect(canvas.dataset.warRoomClassicMeshNodes).toBe('1');
    expect(canvas.dataset.warRoomClassicMeshInstances).toBe('1');
    expect(canvas.dataset.warRoomClassicUniqueGeometries).toBe('1');
    expect(canvas.dataset.warRoomClassicUniqueTriangles).toBe('12');
    expect(JSON.parse(canvas.dataset.warRoomClassicTopOwnerFamilies)).toEqual([{
      owner: 'room-structure', meshNodes: 1, meshInstances: 1,
      uniqueGeometries: 1, potentialTriangles: 12, uniqueTriangles: 12,
    }]);
    expect(loadModule).toHaveBeenCalledTimes(1);
    await controller.ensure();
    expect(loadModule).toHaveBeenCalledTimes(1);

    const schoolCanvas = { dataset: {}, isConnected: true };
    const school = createClassicWarRoomShellController(
      { canvas: schoolCanvas, classroom: true }, false, {
        loadModule: async () => ({
          buildClassicWarRoomShell: () => ({ classicShellObjects: [group] }),
        }),
      },
    );
    await school.ensure();
    expect(schoolCanvas.dataset.warRoomClassicPotentialTriangles).toBeUndefined();
    expect(schoolCanvas.dataset.classicShellModule).toBe('school-room-dedicated-v1');
  });


});
