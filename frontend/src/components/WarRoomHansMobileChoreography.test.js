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
  it('avanza la FSM real: camina, gira, recoge leña, aviva el fuego y sale por la puerta', () => {
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
      expect(hans.userData.warRoomHansFacingTarget).toBe('basket');

      const startX = hans.position.x;
      const startZ = hans.position.z;
      const initialYaw = hans.rotation.y;

      // Mobile starts 4.8 s into the service-corridor entrance. Advance to the
      // basket: a new render must consume elapsed wall time and physically move
      // the same Three.js rig, even when CI itself uses a software renderer.
      now.mockReturnValue(3300); // effective choreography elapsed ~= 7.1 s
      driver.onBeforeRender();
      expect(driver.userData.warRoomHansPhase).toBe('take-log');
      expect(hans.userData.warRoomHansFacingTarget).toBe('basket');
      expect(Math.hypot(hans.position.x - startX, hans.position.z - startZ)).toBeGreaterThan(0.25);
      expect(Math.abs(hans.rotation.y - initialYaw)).toBeGreaterThan(0.05);

      now.mockReturnValue(5500); // carry-log
      driver.onBeforeRender();
      expect(driver.userData.warRoomHansPhase).toBe('carry-log');
      expect(hans.userData.warRoomHansFacingTarget).toBe('hearth');
      expect(basketTopLog.visible).toBe(false);
      expect(carriedLog.visible).toBe(true);
      expect(Math.abs(hans.userData.refs.leftLeg.rotation.x)).toBeGreaterThan(0.01);
      expect(Math.abs(hans.userData.refs.rightLeg.rotation.x)).toBeGreaterThan(0.01);

      now.mockReturnValue(9800); // late place-log
      driver.onBeforeRender();
      expect(driver.userData.warRoomHansPhase).toBe('place-log');
      expect(hans.userData.warRoomHansFacingTarget).toBe('fire');
      expect(carriedLog.visible).toBe(false);
      expect(addedLog.visible).toBe(true);

      now.mockReturnValue(11900); // late take-poker
      driver.onBeforeRender();
      expect(driver.userData.warRoomHansPhase).toBe('take-poker');
      expect(hans.userData.warRoomHansFacingTarget).toBe('tools');
      expect(standPoker.visible).toBe(false);
      expect(carriedPoker.visible).toBe(true);

      const dimmedFireHeight = fireCore.scale.y;
      now.mockReturnValue(15700); // stoke-fire
      driver.onBeforeRender();
      expect(driver.userData.warRoomHansPhase).toBe('stoke-fire');
      expect(hans.userData.warRoomHansFacingTarget).toBe('fire');
      expect(carriedPoker.visible).toBe(true);
      expect(fireCore.scale.y).toBeGreaterThan(dimmedFireHeight);

      now.mockReturnValue(19600); // satisfied, poker already returned
      driver.onBeforeRender();
      expect(driver.userData.warRoomHansPhase).toBe('satisfied');
      expect(hans.userData.warRoomHansFacingTarget).toBe('fire');
      expect(carriedPoker.visible).toBe(false);
      expect(standPoker.visible).toBe(true);

      now.mockReturnValue(24200); // leave, door open
      driver.onBeforeRender();
      expect(driver.userData.warRoomHansPhase).toBe('leave');
      expect(hans.userData.warRoomHansFacingTarget).toBe('door');
      expect(door.userData.warRoomHansDoorOpen).toBeGreaterThan(0.5);
      expect(hans.visible).toBe(true);

      now.mockReturnValue(26300); // complete after crossing the threshold
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
