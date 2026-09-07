import { afterEach, describe, expect, it } from 'vitest';
import { buildPremiumWarRoomLayer } from './PremiumWarRoomScene.js';
import {
  installWarRoomHansSceneRoutine,
  setWarRoomHansQuickIterationEnabled,
} from './WarRoomHansIteration.js';

function dispose(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse((object) => {
    if (object.geometry && !geometries.has(object.geometry)) {
      geometries.add(object.geometry);
      object.geometry.dispose?.();
    }
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) {
      if (!material || materials.has(material)) continue;
      materials.add(material);
      material.dispose?.();
    }
  });
}

function facingDotToTarget(hans, target, towardBoard) {
  const dx = target.position.x - hans.position.x;
  const dz = target.position.z - hans.position.z;
  const distance = Math.hypot(dx, dz);
  const forwardSign = towardBoard < 0 ? -1 : 1;
  const faceX = Math.sin(hans.rotation.y) * forwardSign;
  const faceZ = Math.cos(hans.rotation.y) * forwardSign;
  return ((faceX * dx) + (faceZ * dz)) / distance;
}

afterEach(() => setWarRoomHansQuickIterationEnabled(false));

describe('Hans authored forward axis', () => {
  it.each([1, -1])('mira hacia la cesta al entrar con towardBoard=%s', (towardBoard) => {
    setWarRoomHansQuickIterationEnabled(true);
    const room = buildPremiumWarRoomLayer({ felt: 0x173943, glow: 0xc5963f }, true, true);

    try {
      expect(installWarRoomHansSceneRoutine(room, { towardBoard, coarsePointer: true })).toBeGreaterThan(0);
      const hans = room.getObjectByName('war-room-hans-butler');
      const basket = room.getObjectByName('war-room-hearth-log-basket');

      expect(hans).toBeTruthy();
      expect(basket).toBeTruthy();
      expect(hans.visible).toBe(true);
      expect(hans.userData.warRoomHansFacingTarget).toBe('basket');
      expect(facingDotToTarget(hans, basket, towardBoard)).toBeGreaterThan(0.999);
    } finally {
      dispose(room);
    }
  });
});
