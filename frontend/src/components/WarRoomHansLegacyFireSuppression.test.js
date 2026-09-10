import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  WAR_ROOM_HANS_LEGACY_FIRE_SUPPRESSION_VERSION,
  registerWarRoomDeferredFinalizer,
} from './WarRoomDeferredFinalizer.js';

const HANS_FINALIZER_KEY = 'hans-fireplace-scene-install-v2';

function buildHarness({ quick = false } = {}) {
  const root = new THREE.Group();
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial(),
  );
  floor.name = 'war-room-castle-floor-slab';
  root.add(floor);

  const fireplace = new THREE.Group();
  fireplace.name = 'war-room-fireplace';
  root.add(fireplace);

  const hans = new THREE.Group();
  hans.name = 'war-room-hans-butler';
  hans.visible = true;
  fireplace.add(hans);

  const driver = new THREE.Mesh(
    new THREE.PlaneGeometry(0.01, 0.01),
    new THREE.MeshBasicMaterial(),
  );
  driver.name = 'war-room-hans-fireplace-driver';
  driver.userData.warRoomHansSelected = true;
  if (quick) driver.userData.warRoomHansQuickIteration = 'test-quick-fire';
  driver.onBeforeRender = vi.fn();
  fireplace.add(driver);

  return { root, floor, fireplace, hans, driver };
}

function dispose(root) {
  root.traverse((object) => {
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material?.dispose?.();
  });
}

describe('canonical Hans fire ownership', () => {
  it('suppresses the old independent random fireplace routine before it can render', () => {
    const harness = buildHarness();
    const legacyFrame = harness.driver.onBeforeRender;
    try {
      expect(registerWarRoomDeferredFinalizer(harness.root, {
        key: HANS_FINALIZER_KEY,
        run: () => 2,
      })).toBe(1);

      harness.floor.onAfterRender();

      expect(harness.driver.userData.warRoomHansSelected).toBe(false);
      expect(harness.driver.userData.warRoomHansPhase).toBe('deterministic-event-required');
      expect(harness.driver.userData.warRoomHansLegacyRandomSuppressed)
        .toBe(WAR_ROOM_HANS_LEGACY_FIRE_SUPPRESSION_VERSION);
      expect(harness.fireplace.userData.warRoomHansEventSelected).toBe(false);
      expect(harness.hans.visible).toBe(false);

      harness.driver.onBeforeRender();
      expect(legacyFrame).not.toHaveBeenCalled();
    } finally {
      dispose(harness.root);
    }
  });

  it('preserves the selected quick fire routine that owns the full dialogue sequence', () => {
    const harness = buildHarness({ quick: true });
    const quickFrame = harness.driver.onBeforeRender;
    try {
      expect(registerWarRoomDeferredFinalizer(harness.root, {
        key: HANS_FINALIZER_KEY,
        run: () => 2,
      })).toBe(1);

      harness.floor.onAfterRender();

      expect(harness.driver.userData.warRoomHansSelected).toBe(true);
      expect(harness.driver.userData.warRoomHansLegacyRandomSuppressed).toBeUndefined();
      expect(harness.hans.visible).toBe(true);

      harness.driver.onBeforeRender();
      expect(quickFrame).toHaveBeenCalledTimes(1);
    } finally {
      dispose(harness.root);
    }
  });
});
