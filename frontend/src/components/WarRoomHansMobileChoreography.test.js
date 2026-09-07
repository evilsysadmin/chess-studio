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
      expect(driver.userData.warRoomHansPresentationTimeScale).toBeCloseTo(0.54, 6);
    } finally {
      dispose(room);
    }
  });

  it('avanza la FSM real despacio desde el primer render: leña, fuego, atizador, bypass de armadura y puerta', () => {
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
      expect(driver.userData.warRoomHansChoreography).toBe('door-log-fire-poker-armor-bypass-door-v3');
      expect(driver.userData.warRoomHansMobileEntryHeadstartSeconds).toBe(0);
      expect(driver.userData.warRoomHansClockStart).toBe('first-real-render-v1');
      expect(driver.userData.warRoomHansPresentationTimeScale).toBeCloseTo(0.54, 6);
      expect(hans.userData.warRoomHansFacingTarget).toBe('basket');

      const startX = hans.position.x;
      const startZ = hans.position.z;
      const initialYaw = hans.rotation.y;

      driver.onBeforeRender();
      expect(driver.userData.warRoomHansPhase).toBe('fire-dimming');
      expect(hans.visible).toBe(true);

      now.mockReturnValue(14148); // ~=7.1 s de presentación => take-log
      driver.onBeforeRender();
      expect(driver.userData.warRoomHansPhase).toBe('take-log');
      expect(hans.userData.warRoomHansFacingTarget).toBe('basket');
      expect(Math.hypot(hans.position.x - startX, hans.position.z - startZ)).toBeGreaterThan(0.25);
      expect(Math.abs(hans.rotation.y - initialYaw)).toBeGreaterThan(0.05);

      now.mockReturnValue(18593); // ~=9.5 s de presentación => carry-log
      driver.onBeforeRender();
      expect(driver.userData.warRoomHansPhase).toBe('carry-log');
      expect(hans.userData.warRoomHansFacingTarget).toBe('hearth');
      expect(basketTopLog.visible).toBe(false);
      expect(carriedLog.visible).toBe(true);
      expect(Math.abs(hans.userData.refs.leftLeg.rotation.x)).toBeGreaterThan(0.01);
      expect(Math.abs(hans.userData.refs.rightLeg.rotation.x)).toBeGreaterThan(0.01);

      now.mockReturnValue(26185); // ~=13.6 s presentación => late place-log
      driver.onBeforeRender();
      expect(driver.userData.warRoomHansPhase).toBe('place-log');
      expect(hans.userData.warRoomHansFacingTarget).toBe('fire');
      expect(carriedLog.visible).toBe(false);
      expect(addedLog.visible).toBe(true);

      now.mockReturnValue(30074); // ~=15.7 s presentación => late take-poker
      driver.onBeforeRender();
      expect(driver.userData.warRoomHansPhase).toBe('take-poker');
      expect(hans.userData.warRoomHansFacingTarget).toBe('tools');
      expect(standPoker.visible).toBe(false);
      expect(carriedPoker.visible).toBe(true);

      const dimmedFireHeight = fireCore.scale.y;
      now.mockReturnValue(35259); // ~=18.5 s presentación => stoke-fire
      driver.onBeforeRender();
      expect(driver.userData.warRoomHansPhase).toBe('stoke-fire');
      expect(hans.userData.warRoomHansFacingTarget).toBe('fire');
      expect(carriedPoker.visible).toBe(true);
      expect(fireCore.scale.y).toBeGreaterThan(dimmedFireHeight);

      now.mockReturnValue(43593); // ~=23 s presentación => satisfied
      driver.onBeforeRender();
      expect(driver.userData.warRoomHansPhase).toBe('satisfied');
      expect(hans.userData.warRoomHansFacingTarget).toBe('fire');
      expect(carriedPoker.visible).toBe(false);
      expect(standPoker.visible).toBe(true);

      now.mockReturnValue(51000); // ~=27 s presentación => bypass delante de armadura
      driver.onBeforeRender();
      expect(driver.userData.warRoomHansPhase).toBe('leave');
      expect(hans.userData.warRoomHansRoute).toBe('leave-bypass');
      expect(hans.userData.warRoomHansFacingTarget).toBe('bypass-forward');
      expect(Math.abs(hans.position.x)).toBeCloseTo(1.42, 5);
      expect(door.userData.warRoomHansDoorOpen).toBe(0);

      now.mockReturnValue(53778); // ~=28.5 s presentación => aproximación final a puerta
      driver.onBeforeRender();
      expect(driver.userData.warRoomHansPhase).toBe('leave');
      expect(hans.userData.warRoomHansRoute).toBe('leave-door');
      expect(hans.userData.warRoomHansFacingTarget).toBe('door');
      // At 0.54x Hans has only just started reopening the door here; prove it is
      // actively opening rather than requiring the old faster choreography's midpoint.
      expect(door.userData.warRoomHansDoorOpen).toBeGreaterThan(0.25);
      expect(hans.visible).toBe(true);

      now.mockReturnValue(57481); // ~=30.5 s presentación => complete
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
