import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildPremiumWarRoomLayer } from './PremiumWarRoomScene.js';
import {
  acquireWarRoomHansQuickIteration,
  installWarRoomHansSceneRoutine,
  isWarRoomHansQuickIterationEnabled,
  releaseWarRoomHansQuickIteration,
  setWarRoomHansQuickIterationEnabled,
} from './WarRoomHansIteration.js';
import { setWarRoomHansServiceDoorOpen } from './WarRoomHansServiceDoor.js';

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

afterEach(() => setWarRoomHansQuickIterationEnabled(false));

describe('Hans rear-hearth layout and service door', () => {
  it('mantiene el permiso forzado hasta que se libera el último propietario', () => {
    expect(acquireWarRoomHansQuickIteration()).toBe(1);
    expect(acquireWarRoomHansQuickIteration()).toBe(2);
    expect(isWarRoomHansQuickIterationEnabled()).toBe(true);
    expect(releaseWarRoomHansQuickIteration()).toBe(1);
    expect(isWarRoomHansQuickIterationEnabled()).toBe(true);
    expect(releaseWarRoomHansQuickIteration()).toBe(0);
    expect(isWarRoomHansQuickIterationEnabled()).toBe(false);
  });

  it('pega capazo y herramientas al fondo y abre la puerta hacia el pasillo de servicio', () => {
    setWarRoomHansQuickIterationEnabled(true);
    const room = buildPremiumWarRoomLayer({ felt: 0x173943, glow: 0xc5963f }, true, false);

    try {
      expect(installWarRoomHansSceneRoutine(room, { towardBoard: 1, coarsePointer: false })).toBeGreaterThan(0);

      const basket = room.getObjectByName('war-room-hearth-log-basket');
      const tools = room.getObjectByName('war-room-hearth-tool-stand');
      const kit = room.getObjectByName('war-room-hans-hearth-kit');
      const door = room.getObjectByName('war-room-hans-service-door');
      const handle = room.getObjectByName('war-room-hans-service-door-handle');
      const refs = door?.userData?.refs;

      expect(basket).toBeTruthy();
      expect(tools).toBeTruthy();
      expect(kit).toBeTruthy();
      expect(door).toBeTruthy();
      expect(handle).toBeTruthy();
      expect(refs).toBeTruthy();

      expect(basket.userData.warRoomHansHearthDepth).toBe('rear-wall-v1');
      expect(tools.userData.warRoomHansHearthDepth).toBe('rear-wall-v1');
      expect(kit.userData.warRoomHansHearthDepth).toBe('rear-wall-v1');
      expect(Math.abs(basket.position.z)).toBeLessThanOrEqual(0.3);
      expect(Math.abs(tools.position.z)).toBeLessThanOrEqual(0.25);
      expect(basket.userData.warRoomHansBasketFinish).toBe('graphite-grey-v1');

      room.updateMatrixWorld(true);
      const closed = handle.getWorldPosition(new THREE.Vector3());
      setWarRoomHansServiceDoorOpen(refs, 1);
      room.updateMatrixWorld(true);
      const open = handle.getWorldPosition(new THREE.Vector3());

      expect(door.userData.warRoomHansDoorSwing).toBe('into-service-corridor-v1');
      expect(Math.abs(open.x)).toBeGreaterThan(Math.abs(closed.x));
      expect(Math.abs(refs.pivot.rotation.y)).toBeGreaterThan(0.8);
    } finally {
      dispose(room);
    }
  });
});
