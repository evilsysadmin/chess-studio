import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildPremiumWarRoomLayer } from './PremiumWarRoomScene.js';
import { WAR_ROOM_HANS_FIRE_NARRATIVE_VERSION } from './WarRoomHansFireNarrative.js';
import { setWarRoomHansQuickIterationEnabled } from './WarRoomHansIteration.js';

const theme = {
  felt: 0x173943,
  glow: 0xc5963f,
};

function dispose(root) {
  const geometries = new Set();
  const materials = new Set();
  root?.traverse?.((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const list = Array.isArray(object.material) ? object.material : [object.material];
    list.forEach((material) => {
      if (!material) return;
      materials.add(material);
      material.map?.dispose?.();
    });
  });
  geometries.forEach((geometry) => geometry.dispose?.());
  materials.forEach((material) => material.dispose?.());
}

function runHansBridge({ coarsePointer = false, awaitCall = false } = {}) {
  setWarRoomHansQuickIterationEnabled(true);

  const scene = new THREE.Scene();
  scene.userData.warRoomHansAwaitCall = awaitCall;
  const room = buildPremiumWarRoomLayer(theme, true, coarsePointer);
  scene.add(room);

  const floor = room.getObjectByName('war-room-castle-floor-slab');
  expect(floor).toBeTruthy();
  expect(floor.userData.warRoomDeferredFinalizer).toBe('deferred-finalizer-v1');
  expect(floor.userData.warRoomDeferredFinalizerPhase).toBe('after');
  expect(typeof floor.onAfterRender).toBe('function');

  floor.onAfterRender();

  return { scene, room };
}

afterEach(() => {
  setWarRoomHansQuickIterationEnabled(false);
  vi.restoreAllMocks();
});

describe('War Room Hans live render bridge', () => {
  it('arma a Hans con el hogar ya frío y abre la puerta desde el suelo arquitectónico', () => {
    const { scene, room } = runHansBridge();
    const painting = room.getObjectByName('war-room-premium-painting-canvas');

    expect(painting?.userData?.warRoomDeferredFinalizerTaskCount || 0).toBeGreaterThan(0);

    const fireplace = scene.getObjectByName('war-room-fireplace');
    const fireCore = scene.getObjectByName('war-room-fire-core');
    const fireLight = scene.getObjectByName('war-room-fire-light');
    const hans = scene.getObjectByName('war-room-hans-butler');
    const driver = scene.getObjectByName('war-room-hans-fireplace-driver');
    const door = scene.getObjectByName('war-room-hans-service-door');

    expect(fireplace?.userData?.warRoomHansEventSelected).toBe(true);
    expect(fireplace?.userData?.warRoomHansFireNarrative).toBe(WAR_ROOM_HANS_FIRE_NARRATIVE_VERSION);
    expect(fireplace?.userData?.warRoomHansFireNarrativePhase).toBe('hearth-cold');
    expect(driver?.userData?.warRoomHansFireNarrativePolicy).toBe('already-cold-then-rekindle-v1');
    expect(fireCore?.visible).toBe(false);
    expect(Number(fireLight?.intensity || 0)).toBeGreaterThan(0);
    expect(Number(fireLight?.intensity || 0)).toBeLessThan(1);
    expect(hans).toBeTruthy();
    expect(hans.visible).toBe(true);
    expect(driver?.userData?.warRoomHansVisibleAtStart).toBe(true);
    expect(door?.userData?.warRoomHansDoorOpen).toBe(1);
    expect(scene.userData.warRoomDeferredFinalizedTasks).toContain('hans-fireplace-scene-install-v2');

    dispose(scene);
  });

  it('mantiene a Hans forzado también en renderLite/coarse, donde antes nunca se registraba', () => {
    const { scene } = runHansBridge({ coarsePointer: true });

    const fireplace = scene.getObjectByName('war-room-fireplace');
    const fireCore = scene.getObjectByName('war-room-fire-core');
    const hans = scene.getObjectByName('war-room-hans-butler');
    const driver = scene.getObjectByName('war-room-hans-fireplace-driver');
    const door = scene.getObjectByName('war-room-hans-service-door');

    expect(fireplace?.userData?.warRoomHansFireNarrativePhase).toBe('hearth-cold');
    expect(fireCore?.visible).toBe(false);
    expect(hans).toBeTruthy();
    expect(hans.visible).toBe(true);
    expect(driver?.userData?.warRoomHansVisibleAtStart).toBe(true);
    expect(door?.userData?.warRoomHansDoorOpen).toBe(1);
    expect(scene.userData.warRoomHansRuntime).toBe('visible');
    expect(scene.userData.warRoomDeferredFinalizedTasks).toContain('hans-fireplace-scene-install-v2');

    dispose(scene);
  });
});

for (const coarsePointer of [false, true]) {
  it(`waits for the rendered call, then opens the door without skipping on a late frame (coarse=${coarsePointer})`, () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const { scene } = runHansBridge({ coarsePointer, awaitCall: true });
    const hans = scene.getObjectByName('war-room-hans-butler');
    const driver = scene.getObjectByName('war-room-hans-fireplace-driver');
    const door = scene.getObjectByName('war-room-hans-service-door');
    const fire = scene.getObjectByName('war-room-fire-core');
    try {
      expect(driver.userData.warRoomHansEntryPresentation).toBe('full-service-corridor-v3-slow');
      for (now of [0, 1000, 30_000]) {
        driver.onBeforeRender();
        expect(hans.visible).toBe(false);
        expect(door.userData.warRoomHansDoorOpen).toBe(0);
        expect(fire.visible).toBe(false);
      }
      scene.userData.warRoomHansCallReleased = true;
      now += 30_000;
      driver.onBeforeRender();
      expect(hans.visible).toBe(false);
      expect(door.userData.warRoomHansDoorOpen).toBeGreaterThan(0);
      expect(door.userData.warRoomHansDoorOpen).toBeLessThan(1);
      for (let i = 0; i < 8; i += 1) {
        now += 100;
        driver.onBeforeRender();
      }
      expect(hans.visible).toBe(true);
      expect(Math.abs(hans.position.x)).toBeGreaterThan(2.4);
      expect(Math.abs(hans.position.z)).toBeGreaterThan(4);
      expect(driver.userData.warRoomHansPhase).toBe('fire-dimming');
      expect(fire.visible).toBe(false);
    } finally {
      dispose(scene);
    }
  });
}
