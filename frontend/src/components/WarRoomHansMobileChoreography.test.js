import { afterEach, describe, expect, it, vi } from 'vitest';
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

afterEach(() => setWarRoomHansQuickIterationEnabled(false));

describe('Hans hearth choreography on coarse-pointer/mobile War Room', () => {
  it('promociona una instalación móvil parcial al rig completo cuando llega el lease forzado', () => {
    setWarRoomHansQuickIterationEnabled(false);
    const room = buildPremiumWarRoomLayer({ felt: 0x173943, glow: 0xc5963f }, true, true);

    try {
      expect(installWarRoomHansSceneRoutine(room, { towardBoard: 1, coarsePointer: true })).toBeGreaterThan(0);
      const fireplace = room.getObjectByName('war-room-fireplace');
      expect(fireplace?.userData?.warRoomHansFireplaceRoutine).toBeTruthy();
      expect(room.getObjectByName('war-room-hans-butler')).toBeFalsy();
      expect(room.getObjectByName('war-room-hans-fireplace-driver')).toBeFalsy();

      setWarRoomHansQuickIterationEnabled(true);
      expect(installWarRoomHansSceneRoutine(room, { towardBoard: 1, coarsePointer: true })).toBeGreaterThan(0);

      const hans = room.getObjectByName('war-room-hans-butler');
      const driver = room.getObjectByName('war-room-hans-fireplace-driver');
      expect(fireplace?.userData?.warRoomHansForcedUpgrade).toBe('partial-mobile-to-full-v1');
      expect(hans).toBeTruthy();
      expect(driver).toBeTruthy();
      expect(hans.visible).toBe(true);
      expect(driver.userData.warRoomHansVisibleAtStart).toBe(true);
      expect(driver.userData.warRoomHansMobileEntryHeadstartSeconds).toBe(0);
      expect(driver.userData.warRoomHansClockStart).toBe('first-real-render-v1');
    } finally {
      dispose(room);
    }
  });

  it('avanza la FSM real desde el primer render: camina, gira, recoge leña, aviva el fuego y sale por la puerta', () => {
    const now = vi.spyOn(globalThis.performance, 'now').mockReturnValue(1000);
    setWarRoomHansQuickIterationEnabled(true);
    const room = buildPremiumWarRoomLayer({ felt: 0x173943, glow: 0xc5963f }, true, true);

    try {
      expect(installWarRoomHansSceneRoutine(room, { towardBoard: 1, coarsePointer: true })).toBeGreaterThan(0);

      const hans = room.getObjectByName('war-room-hans-butler');
      const driver = room.getObjectByName('war-room-hans-fireplace-driver');
      const basketTopLog = room.getObjectByName('war-room-hearth-basket-top-log');
      const addedLog = room.getObjectByName('war-room-hans-hearth-added-log');
      const standPoker = room.getObjectByName('war-room-hearth-poker');
      const carriedLog = room.getObjectByName('war-room-hans-carried-log');
      const carriedPoker = room.getObjectByName('war-room-hans-carried-poker');
      const fireCore = room.getObjectByName('war-room-fire-core');
      const door = room.getObjectByName('war-room-hans-service-door');

      expect(hans).toBeTruthy();
      expect(driver).toBeTruthy();
      expect(basketTopLog).toBeTruthy();
      expect(addedLog).toBeTruthy();
      expect(standPoker).toBeTruthy();
      expect(carriedLog).toBeTruthy();
      expect(carriedPoker).toBeTruthy();
      expect(fireCore).toBeTruthy();
      expect(door).toBeTruthy();
      expect(driver.userData.warRoomHansChoreography).toBe('door-log-fire-poker-door-v2');
      expect(driver.userData.warRoomHansMobileEntryHeadstartSeconds).toBe(0);
      expect(driver.userData.warRoomHansClockStart).toBe('first-real-render-v1');
      expect(hans.userData.warRoomHansFacingTarget).toBe('basket');

      const startX = hans.position.x;
      const startZ = hans.position.z;
      const initialYaw = hans.rotation.y;

      // The first real render owns t=0. Mobile is already onscreen spatially,
      // but no story time has been silently consumed during scene construction.
      driver.onBeforeRender();
      expect(driver.userData.warRoomHansPhase).toBe('fire-dimming');
      expect(hans.visible).toBe(true);

      now.mockReturnValue(8100); // choreography elapsed ~= 7.1 s => take-log
      driver.onBeforeRender();
      expect(driver.userData.warRoomHansPhase).toBe('take-log');
      expect(hans.userData.warRoomHansFacingTarget).toBe('basket');
      expect(Math.hypot(hans.position.x - startX, hans.position.z - startZ)).toBeGreaterThan(0.25);
      expect(Math.abs(hans.rotation.y - initialYaw)).toBeGreaterThan(0.05);

      now.mockReturnValue(10500); // carry-log
      driver.onBeforeRender();
      expect(driver.userData.warRoomHansPhase).toBe('carry-log');
      expect(hans.userData.warRoomHansFacingTarget).toBe('hearth');
      expect(basketTopLog.visible).toBe(false);
      expect(carriedLog.visible).toBe(true);
      expect(Math.abs(hans.userData.refs.leftLeg.rotation.x)).toBeGreaterThan(0.01);
      expect(Math.abs(hans.userData.refs.rightLeg.rotation.x)).toBeGreaterThan(0.01);

      now.mockReturnValue(13800); // place-log
      driver.onBeforeRender();
      expect(driver.userData.warRoomHansPhase).toBe('place-log');
      expect(hans.userData.warRoomHansFacingTarget).toBe('fire');
      expect(carriedLog.visible).toBe(false);
      expect(addedLog.visible).toBe(true);

      now.mockReturnValue(16300); // take-poker
      driver.onBeforeRender();
      expect(driver.userData.warRoomHansPhase).toBe('take-poker');
      expect(hans.userData.warRoomHansFacingTarget).toBe('tools');
      expect(standPoker.visible).toBe(false);
      expect(carriedPoker.visible).toBe(true);

      const dimmedFireHeight = fireCore.scale.y;
      now.mockReturnValue(19500); // stoke-fire
      driver.onBeforeRender();
      expect(driver.userData.warRoomHansPhase).toBe('stoke-fire');
      expect(hans.userData.warRoomHansFacingTarget).toBe('fire');
      expect(carriedPoker.visible).toBe(true);
      expect(fireCore.scale.y).toBeGreaterThan(dimmedFireHeight);

      now.mockReturnValue(24000); // satisfied, poker already returned
      driver.onBeforeRender();
      expect(driver.userData.warRoomHansPhase).toBe('satisfied');
      expect(hans.userData.warRoomHansFacingTarget).toBe('fire');
      expect(carriedPoker.visible).toBe(false);
      expect(standPoker.visible).toBe(true);

      now.mockReturnValue(29500); // leave, door open
      driver.onBeforeRender();
      expect(driver.userData.warRoomHansPhase).toBe('leave');
      expect(hans.userData.warRoomHansFacingTarget).toBe('door');
      expect(door.userData.warRoomHansDoorOpen).toBeGreaterThan(0.5);
      expect(hans.visible).toBe(true);

      now.mockReturnValue(31500); // complete after crossing the threshold
      driver.onBeforeRender();
      expect(driver.userData.warRoomHansCompleted).toBe(true);
      expect(driver.userData.warRoomHansHearthRestored).toBe(true);
      expect(hans.visible).toBe(false);
      expect(door.userData.warRoomHansDoorOpen).toBe(0);
      expect(addedLog.visible).toBe(true);
      expect(standPoker.visible).toBe(true);
    } finally {
      now.mockRestore();
      dispose(room);
    }
  });
});
