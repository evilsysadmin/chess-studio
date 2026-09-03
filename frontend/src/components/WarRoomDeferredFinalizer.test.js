import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  WAR_ROOM_DEFERRED_FINALIZER_VERSION,
  WAR_ROOM_ONE_SHOT_RETIREMENT_VERSION,
  armWarRoomOneShotHookRetirement,
  registerWarRoomDeferredFinalizer,
} from './WarRoomDeferredFinalizer.js';

function mesh(name) {
  const item = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x555555 }),
  );
  item.name = name;
  return item;
}

describe('WarRoomDeferredFinalizer', () => {
  it('shares one render hook and runs registered static tasks only once', () => {
    const root = new THREE.Group();
    const owner = new THREE.Group();
    const canvas = mesh('war-room-premium-painting-canvas');
    const wall = mesh('war-room-castle-wall-left');
    const previous = vi.fn();
    const first = vi.fn(() => 3);
    const second = vi.fn(() => 7);

    canvas.onBeforeRender = previous;
    owner.add(canvas, wall);
    root.add(owner);

    expect(registerWarRoomDeferredFinalizer(owner, { key: 'first', run: first })).toBe(1);
    const sharedHook = canvas.onBeforeRender;
    expect(registerWarRoomDeferredFinalizer(owner, { key: 'second', run: second })).toBe(1);
    expect(canvas.onBeforeRender).toBe(sharedHook);
    expect(owner.userData.warRoomDeferredFinalizer).toBe(WAR_ROOM_DEFERRED_FINALIZER_VERSION);
    expect(owner.userData.warRoomDeferredFinalizerTaskCount).toBe(2);

    canvas.onBeforeRender();

    expect(previous).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledWith(root);
    expect(second).toHaveBeenCalledWith(root);
    expect(root.userData.warRoomDeferredFinalizer).toBe(WAR_ROOM_DEFERRED_FINALIZER_VERSION);
    expect(root.userData.warRoomDeferredFinalizerRuns).toBe(1);
    expect(root.userData.warRoomDeferredFinalizedTasks).toEqual(['first', 'second']);
    expect(root.userData.warRoomDeferredFinalizerResults).toEqual({ first: 3, second: 7 });
    expect(canvas.userData.warRoomDeferredFinalizerCompleted).toBe(true);

    canvas.onBeforeRender();
    expect(previous).toHaveBeenCalledTimes(2);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('falls back to the castle wall, rejects duplicates and only runs coarse tasks when explicitly allowed', () => {
    const owner = new THREE.Group();
    const wall = mesh('war-room-castle-wall-left');
    const task = vi.fn(() => 1);
    owner.add(wall);

    expect(registerWarRoomDeferredFinalizer(owner, { key: 'wall-task', run: task })).toBe(1);
    expect(registerWarRoomDeferredFinalizer(owner, { key: 'wall-task', run: task })).toBe(0);
    expect(typeof wall.onBeforeRender).toBe('function');

    wall.onBeforeRender();
    expect(task).toHaveBeenCalledTimes(1);
    expect(registerWarRoomDeferredFinalizer(owner, { key: 'late-task', run: task })).toBe(0);

    const mobile = new THREE.Group();
    const mobileWall = mesh('war-room-castle-wall-left');
    const mobileTask = vi.fn(() => 5);
    mobile.add(mobileWall);
    expect(registerWarRoomDeferredFinalizer(mobile, {
      key: 'mobile-task',
      run: mobileTask,
      coarsePointer: true,
    })).toBe(0);
    expect(registerWarRoomDeferredFinalizer(mobile, {
      key: 'mobile-opt-in-task',
      run: mobileTask,
      coarsePointer: true,
      allowCoarse: true,
    })).toBe(1);
    expect(mobile.userData.warRoomDeferredFinalizer).toBe(WAR_ROOM_DEFERRED_FINALIZER_VERSION);
    mobileWall.onBeforeRender();
    expect(mobileTask).toHaveBeenCalledTimes(1);
  });

  it('retires a static render chain after its first paint, including a later outer wrapper', () => {
    const owner = new THREE.Group();
    const wall = mesh('war-room-castle-wall-left');
    const staticPass = vi.fn();
    const outerLegacyPass = vi.fn();
    wall.onBeforeRender = staticPass;
    owner.add(wall);

    expect(armWarRoomOneShotHookRetirement(owner, {
      anchorName: 'war-room-castle-wall-left',
      key: 'static-room-pass',
    })).toBe(1);
    expect(armWarRoomOneShotHookRetirement(owner, {
      anchorName: 'war-room-castle-wall-left',
      key: 'static-room-pass',
    })).toBe(0);

    const armedHook = wall.onBeforeRender;
    wall.onBeforeRender = (...args) => {
      armedHook(...args);
      outerLegacyPass(...args);
    };

    wall.onBeforeRender();
    expect(staticPass).toHaveBeenCalledTimes(1);
    expect(outerLegacyPass).toHaveBeenCalledTimes(1);
    expect(wall.userData.warRoomOneShotRetirementCompleted).toBe('static-room-pass');
    expect(owner.userData.warRoomOneShotRetirementVersion).toBe(WAR_ROOM_ONE_SHOT_RETIREMENT_VERSION);

    wall.onBeforeRender();
    expect(staticPass).toHaveBeenCalledTimes(1);
    expect(outerLegacyPass).toHaveBeenCalledTimes(1);
  });
});
