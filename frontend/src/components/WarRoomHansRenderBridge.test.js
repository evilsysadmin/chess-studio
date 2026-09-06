import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildPremiumWarRoomLayer } from './PremiumWarRoomScene.js';
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

function runHansBridge({ coarsePointer = false } = {}) {
  setWarRoomHansQuickIterationEnabled(true);

  const scene = new THREE.Scene();
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
});

describe('War Room Hans live render bridge', () => {
  it('arma a Hans y abre la puerta desde el suelo arquitectónico en el primer render real', () => {
    const { scene, room } = runHansBridge();
    const painting = room.getObjectByName('war-room-premium-painting-canvas');

    // Other static passes keep using the established painting driver; only
    // Hans moves to the architectural floor bridge.
    expect(painting?.userData?.warRoomDeferredFinalizerTaskCount || 0).toBeGreaterThan(0);

    const fireplace = scene.getObjectByName('war-room-fireplace');
    const hans = scene.getObjectByName('war-room-hans-butler');
    const driver = scene.getObjectByName('war-room-hans-fireplace-driver');
    const door = scene.getObjectByName('war-room-hans-service-door');

    expect(fireplace?.userData?.warRoomHansEventSelected).toBe(true);
    expect(hans).toBeTruthy();
    expect(hans.visible).toBe(true);
    expect(driver?.userData?.warRoomHansVisibleAtStart).toBe(true);
    expect(door?.userData?.warRoomHansDoorOpen).toBe(1);
    expect(scene.userData.warRoomDeferredFinalizedTasks).toContain('hans-fireplace-scene-install-v2');

    dispose(scene);
  });

  it('mantiene a Hans forzado también en renderLite/coarse, donde antes nunca se registraba', () => {
    const { scene } = runHansBridge({ coarsePointer: true });

    const hans = scene.getObjectByName('war-room-hans-butler');
    const driver = scene.getObjectByName('war-room-hans-fireplace-driver');
    const door = scene.getObjectByName('war-room-hans-service-door');

    expect(hans).toBeTruthy();
    expect(hans.visible).toBe(true);
    expect(driver?.userData?.warRoomHansVisibleAtStart).toBe(true);
    expect(door?.userData?.warRoomHansDoorOpen).toBe(1);
    expect(scene.userData.warRoomHansRuntime).toBe('visible');
    expect(scene.userData.warRoomDeferredFinalizedTasks).toContain('hans-fireplace-scene-install-v2');

    dispose(scene);
  });
});
