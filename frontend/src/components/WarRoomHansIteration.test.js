import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildPremiumWarRoomLayer } from './PremiumWarRoomScene.js';
import {
  hansQuickIterationFrame,
  installWarRoomHansSceneRoutine,
  isWarRoomHansQuickIterationEnabled,
  setWarRoomHansQuickIterationEnabled,
  shouldForceHansQuickIteration,
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

function runHansFirstFrame(room) {
  const finalizerDriver = room.getObjectByName('war-room-castle-floor-slab');
  expect(finalizerDriver?.userData?.warRoomDeferredFinalizerPhase).toBe('after');
  expect(typeof finalizerDriver?.onAfterRender).toBe('function');
  finalizerDriver.onAfterRender();
}

afterEach(() => setWarRoomHansQuickIterationEnabled(false));

describe('Hans quick-game visual iteration', () => {
  it('fuerza solo la Partida rápida estándar', () => {
    expect(shouldForceHansQuickIteration({ hintMode: 'off', memoryContext: {} })).toBe(true);
    expect(shouldForceHansQuickIteration({ hintMode: 'free', memoryContext: {} })).toBe(false);
    expect(shouldForceHansQuickIteration({ hintMode: 'paid', memoryContext: {} })).toBe(false);
    expect(shouldForceHansQuickIteration({ hintMode: 'off', memoryContext: { ghost: true } })).toBe(false);
    expect(shouldForceHansQuickIteration({ hintMode: 'off', memoryContext: { suddenDeath: true } })).toBe(false);
    expect(shouldForceHansQuickIteration({ hintMode: 'off', memoryContext: { runMode: 'boss' } })).toBe(false);
    expect(shouldForceHansQuickIteration({ hintMode: 'off', memoryContext: { nemesis: true } })).toBe(false);
  });

  it('saca a Hans por la puerta desde el segundo cero y lo hace recorrer el lateral con parsimonia', () => {
    const start = hansQuickIterationFrame(0);
    const middle = hansQuickIterationFrame(3.5);
    const almostAtBasket = hansQuickIterationFrame(6.95);
    const takeLog = hansQuickIterationFrame(7.1);

    expect(start.phase).toBe('fire-dimming');
    expect(start.fireScale).toBe(1);
    expect(start.hansVisible).toBe(true);
    expect(start.hansX).toBeCloseTo(2.65, 2);
    expect(start.route).toBe('entry');
    expect(start.routeProgress).toBe(0);
    expect(start.doorOpen).toBe(1);
    expect(start.facingTarget).toBe('basket');

    expect(middle.fireScale).toBeLessThan(1);
    expect(middle.fireScale).toBeGreaterThan(0.26);
    expect(middle.hansVisible).toBe(true);
    expect(middle.hansX).toBeLessThan(start.hansX);
    expect(middle.hansX).toBeGreaterThan(-1.62);
    expect(middle.routeProgress).toBeGreaterThan(0.45);
    expect(middle.routeProgress).toBeLessThan(0.55);
    expect(middle.doorOpen).toBeLessThan(0.5);

    expect(almostAtBasket.fireScale).toBeCloseTo(0.26, 2);
    expect(almostAtBasket.hansVisible).toBe(true);
    expect(almostAtBasket.hansX).toBeCloseTo(-1.62, 1);
    expect(almostAtBasket.routeProgress).toBeGreaterThan(0.99);
    expect(almostAtBasket.doorOpen).toBeLessThan(0.02);

    expect(takeLog.phase).toBe('take-log');
    expect(takeLog.hansVisible).toBe(true);
    expect(takeLog.hansX).toBeCloseTo(-1.62, 2);
    expect(takeLog.fireScale).toBeCloseTo(0.26, 2);
    expect(takeLog.doorOpen).toBe(0);
  });

  it('ejecuta la secuencia completa sin moonwalk ni telequinesis', () => {
    const takeLog = hansQuickIterationFrame(8.2);
    expect(takeLog.phase).toBe('take-log');
    expect(takeLog.facingTarget).toBe('basket');
    expect(takeLog.crouch).toBeGreaterThan(0.1);
    expect(takeLog.carryLog).toBe(true);

    const carryLog = hansQuickIterationFrame(9.5);
    expect(carryLog.phase).toBe('carry-log');
    expect(carryLog.facingTarget).toBe('hearth');
    expect(carryLog.carryLog).toBe(true);
    expect(carryLog.leftArm).toBeLessThan(-0.4);
    expect(carryLog.rightArm).toBeLessThan(-0.4);

    const placeLog = hansQuickIterationFrame(13.6);
    expect(placeLog.phase).toBe('place-log');
    expect(placeLog.facingTarget).toBe('fire');
    expect(placeLog.showAddedLog).toBe(true);
    expect(placeLog.carryLog).toBe(false);

    const walkToPoker = hansQuickIterationFrame(14.5);
    expect(walkToPoker.phase).toBe('take-poker');
    expect(walkToPoker.facingTarget).toBe('tools');
    expect(walkToPoker.carryPoker).toBe(false);

    const takePoker = hansQuickIterationFrame(15.7);
    expect(takePoker.phase).toBe('take-poker');
    expect(takePoker.facingTarget).toBe('tools');
    expect(takePoker.carryPoker).toBe(true);

    const stoke = hansQuickIterationFrame(19.5);
    expect(stoke.phase).toBe('stoke-fire');
    expect(stoke.facingTarget).toBe('fire');
    expect(stoke.carryPoker).toBe(true);
    expect(stoke.fireScale).toBeGreaterThan(0.6);

    const returnPoker = hansQuickIterationFrame(21.2);
    expect(returnPoker.phase).toBe('return-poker');
    expect(returnPoker.facingTarget).toBe('tools');

    const satisfied = hansQuickIterationFrame(23.2);
    expect(satisfied.phase).toBe('satisfied');
    expect(satisfied.facingTarget).toBe('fire');
    expect(satisfied.fireScale).toBe(1);

    const leaving = hansQuickIterationFrame(29);
    expect(leaving.phase).toBe('leave');
    expect(leaving.route).toBe('leave-door');
    expect(leaving.facingTarget).toBe('door');
    expect(leaving.doorOpen).toBeGreaterThan(0.5);
    expect(leaving.fireScale).toBe(1);

    const complete = hansQuickIterationFrame(30.1);
    expect(complete.complete).toBe(true);
    expect(complete.hansVisible).toBe(false);
    expect(complete.doorOpen).toBe(0);
  });

  it('deja la puerta pasada la armadura y el equipo de chimenea al lado contrario', () => {
    setWarRoomHansQuickIterationEnabled(true);
    expect(isWarRoomHansQuickIterationEnabled()).toBe(true);

    const room = buildPremiumWarRoomLayer({ felt: 0x173943, glow: 0xc5963f }, true, false);
    expect(room.getObjectByName('war-room-fireplace')).toBeTruthy();
    expect(room.getObjectByName('war-room-hans-butler')).toBeFalsy();

    runHansFirstFrame(room);

    const hans = room.getObjectByName('war-room-hans-butler');
    const driver = room.getObjectByName('war-room-hans-fireplace-driver');
    const fireplace = room.getObjectByName('war-room-fireplace');
    const door = room.getObjectByName('war-room-hans-service-door');
    const doorPivot = room.getObjectByName('war-room-hans-service-door-pivot');
    const handle = room.getObjectByName('war-room-hans-service-door-handle');
    const armor = room.getObjectByName('war-room-teutonic-armor-left')
      || room.getObjectByName('war-room-armor-guard-left');
    const basket = room.getObjectByName('war-room-hearth-log-basket');
    const tools = room.getObjectByName('war-room-hearth-tool-stand');
    const kit = room.getObjectByName('war-room-hans-hearth-kit');

    expect(hans).toBeTruthy();
    expect(driver).toBeTruthy();
    expect(door).toBeTruthy();
    expect(doorPivot).toBeTruthy();
    expect(handle).toBeTruthy();
    expect(armor).toBeTruthy();
    expect(basket).toBeTruthy();
    expect(tools).toBeTruthy();
    expect(kit).toBeTruthy();
    expect(driver.userData.warRoomHansSelected).toBe(true);
    expect(driver.userData.warRoomHansStartDelaySeconds).toBe(0);
    expect(driver.userData.warRoomHansQuickIteration).toBe('always-quick-v10-slow-obstacle-safe');
    expect(driver.userData.warRoomHansVisibleAtStart).toBe(true);
    expect(driver.userData.warRoomHansUsesServiceDoor).toBe(true);
    expect(driver.userData.warRoomHansServiceCorridor).toBe('armor-bypass-to-service-door-v2');
    expect(driver.userData.warRoomHansChoreography).toBe('door-log-fire-poker-armor-bypass-door-v3');
    expect(driver.userData.warRoomHansPresentationTimeScale).toBeCloseTo(0.68, 6);
    expect(fireplace.userData.warRoomHansQuickIteration).toBe('always-quick-v10-slow-obstacle-safe');
    expect(fireplace.userData.warRoomHansHearthRestored).toBe(false);
    expect(door.userData.warRoomHansServiceDoor).toBe('hans-service-door-v1');
    expect(door.userData.warRoomHansDoorPlacement).toBe('past-armor-service-corridor-v2');
    expect(door.userData.warRoomHansDoorArmorName).toContain('armor');
    expect(door.userData.warRoomHansDoorWorldZ).toBeGreaterThan(armor.position.z + 1.4);
    expect(door.userData.warRoomHansArmorBypassX).toBeCloseTo(1.42, 6);
    expect(door.userData.warRoomHansArmorClearanceAfter).toBeGreaterThan(0.7);
    expect(door.userData.warRoomHansDoorOpen).toBe(1);
    expect(Math.abs(doorPivot.rotation.y)).toBeGreaterThan(0.8);
    expect(basket.userData.warRoomHansHearthSide).toBe('opposite-service-door');
    expect(basket.userData.warRoomHansBasketFinish).toBe('graphite-grey-v1');
    expect(tools.userData.warRoomHansHearthSide).toBe('opposite-service-door');
    expect(kit.userData.warRoomHansServiceDoorClearance).toBe('opposite-side-v1');
    expect(Math.sign(basket.position.x)).toBe(-Math.sign(fireplace.position.x));
    expect(Math.sign(tools.position.x)).toBe(-Math.sign(fireplace.position.x));
    expect(hans.visible).toBe(true);
    expect(Math.abs(hans.position.x)).toBeCloseTo(2.65, 2);
    expect(Math.abs(hans.position.z)).toBeGreaterThan(4);
    expect(hans.userData.warRoomHansFacingTarget).toBe('basket');
    expect(typeof driver.onBeforeRender).toBe('function');

    dispose(room);
  });

  it('fuerza la misma entrada visible en dispositivos táctiles durante la iteración', () => {
    setWarRoomHansQuickIterationEnabled(true);
    const room = buildPremiumWarRoomLayer({ felt: 0x173943, glow: 0xc5963f }, true, true);

    try {
      expect(installWarRoomHansSceneRoutine(room, { towardBoard: 1, coarsePointer: true })).toBeGreaterThan(0);

      const hans = room.getObjectByName('war-room-hans-butler');
      const driver = room.getObjectByName('war-room-hans-fireplace-driver');
      const door = room.getObjectByName('war-room-hans-service-door');
      const basket = room.getObjectByName('war-room-hearth-log-basket');

      expect(hans).toBeTruthy();
      expect(driver).toBeTruthy();
      expect(door).toBeTruthy();
      expect(basket).toBeTruthy();
      expect(driver.userData.warRoomHansSelected).toBe(true);
      expect(driver.userData.warRoomHansQuickIteration).toBe('always-quick-v10-slow-obstacle-safe');
      expect(driver.userData.warRoomHansVisibleAtStart).toBe(true);
      expect(driver.userData.warRoomHansMobileEntryHeadstartSeconds).toBe(0);
      expect(driver.userData.warRoomHansClockStart).toBe('first-real-render-v1');
      expect(driver.userData.warRoomHansEntryPresentation).toBe('mobile-visible-start-v4-slow');
      expect(driver.userData.warRoomHansChoreography).toBe('door-log-fire-poker-armor-bypass-door-v3');
      expect(driver.userData.warRoomHansPresentationTimeScale).toBeCloseTo(0.68, 6);
      expect(hans.visible).toBe(true);
      expect(Math.abs(hans.position.x)).toBeLessThan(1);
      expect(Math.abs(hans.position.z)).toBeLessThan(3);
      expect(hans.userData.warRoomHansFacingTarget).toBe('basket');
      expect(door.userData.warRoomHansDoorOpen).toBe(1);
      expect(door.userData.warRoomHansDoorPlacement).toBe('past-armor-service-corridor-v2');
      expect(basket.userData.warRoomHansBasketFinish).toBe('graphite-grey-v1');
    } finally {
      dispose(room);
    }
  });

  it('mantiene simplificada la War Room táctil cuando no está activo el modo de prueba', () => {
    setWarRoomHansQuickIterationEnabled(false);
    const room = buildPremiumWarRoomLayer({ felt: 0x173943, glow: 0xc5963f }, true, true);

    try {
      expect(installWarRoomHansSceneRoutine(room, { towardBoard: 1, coarsePointer: true })).toBeGreaterThan(0);
      expect(room.getObjectByName('war-room-hans-service-door')).toBeTruthy();
      expect(room.getObjectByName('war-room-hearth-log-basket').userData.warRoomHansBasketFinish).toBe('graphite-grey-v1');
      expect(room.getObjectByName('war-room-hans-butler')).toBeFalsy();
      expect(room.getObjectByName('war-room-hans-fireplace-driver')).toBeFalsy();
    } finally {
      dispose(room);
    }
  });

  it('cierra la puerta dentro, esquiva la armadura, la reabre y oculta a Hans al cruzar el umbral', () => {
    const now = vi.spyOn(globalThis.performance, 'now').mockReturnValue(1000);
    setWarRoomHansQuickIterationEnabled(true);
    const room = buildPremiumWarRoomLayer({ felt: 0x173943, glow: 0xc5963f }, true, false);

    try {
      runHansFirstFrame(room);
      const hans = room.getObjectByName('war-room-hans-butler');
      const driver = room.getObjectByName('war-room-hans-fireplace-driver');
      const door = room.getObjectByName('war-room-hans-service-door');

      expect(door.userData.warRoomHansDoorOpen).toBe(1);
      driver.onBeforeRender();

      now.mockReturnValue(11588); // ~=7.2 s presentación
      driver.onBeforeRender();
      expect(driver.userData.warRoomHansPhase).toBe('take-log');
      expect(door.userData.warRoomHansDoorOpen).toBe(0);
      expect(hans.visible).toBe(true);
      expect(hans.position.x).toBeGreaterThan(0);
      expect(hans.userData.warRoomHansFacingTarget).toBe('basket');

      now.mockReturnValue(40706); // ~=27 s presentación, bypass interior
      driver.onBeforeRender();
      expect(driver.userData.warRoomHansPhase).toBe('leave');
      expect(hans.userData.warRoomHansRoute).toBe('leave-bypass');
      expect(door.userData.warRoomHansDoorOpen).toBe(0);
      expect(hans.visible).toBe(true);
      expect(hans.userData.warRoomHansArmorClearanceApplied).toBe(true);
      expect(hans.userData.warRoomHansArmorSafeFrameX).toBeGreaterThan(0.5);
      expect(Math.abs(hans.position.x)).toBeCloseTo(hans.userData.warRoomHansArmorSafeFrameX, 5);
      expect(Math.abs(hans.position.x)).toBeLessThan(1.42);

      now.mockReturnValue(43647); // ~=29 s presentación, ya pasada la armadura
      driver.onBeforeRender();
      expect(driver.userData.warRoomHansPhase).toBe('leave');
      expect(hans.userData.warRoomHansRoute).toBe('leave-door');
      expect(door.userData.warRoomHansDoorOpen).toBeGreaterThan(0.5);
      expect(hans.visible).toBe(true);
      expect(hans.userData.warRoomHansFacingTarget).toBe('door');

      now.mockReturnValue(44824); // ~=29.8 s presentación
      driver.onBeforeRender();
      expect(driver.userData.warRoomHansPhase).toBe('leave');
      expect(door.userData.warRoomHansDoorOpen).toBeGreaterThan(0.9);
      expect(hans.visible).toBe(false);
    } finally {
      now.mockRestore();
      dispose(room);
    }
  });

  it('recoge la leña, la deposita, reaviva el fuego, devuelve el atizador y se marcha despacio', () => {
    const now = vi.spyOn(globalThis.performance, 'now').mockReturnValue(1000);
    setWarRoomHansQuickIterationEnabled(true);
    const room = buildPremiumWarRoomLayer({ felt: 0x173943, glow: 0xc5963f }, true, false);

    try {
      runHansFirstFrame(room);

      const fireplace = room.getObjectByName('war-room-fireplace');
      const hans = room.getObjectByName('war-room-hans-butler');
      const driver = room.getObjectByName('war-room-hans-fireplace-driver');
      const fireCore = room.getObjectByName('war-room-fire-core');
      const fireLight = room.getObjectByName('war-room-fire-light');
      const bounce = room.getObjectByName('war-room-fire-bounce-light');
      const basketTopLog = room.getObjectByName('war-room-hearth-basket-top-log');
      const addedLog = room.getObjectByName('war-room-hans-hearth-added-log');
      const poker = room.getObjectByName('war-room-hearth-poker');
      const door = room.getObjectByName('war-room-hans-service-door');
      const basket = room.getObjectByName('war-room-hearth-log-basket');
      const carriedLog = room.getObjectByName('war-room-hans-carried-log');
      const carriedPoker = room.getObjectByName('war-room-hans-carried-poker');

      expect(fireplace).toBeTruthy();
      expect(driver).toBeTruthy();
      expect(fireCore).toBeTruthy();
      expect(fireLight).toBeTruthy();
      expect(basketTopLog).toBeTruthy();
      expect(addedLog).toBeTruthy();
      expect(poker).toBeTruthy();
      expect(door).toBeTruthy();
      expect(basket).toBeTruthy();
      expect(carriedLog).toBeTruthy();
      expect(carriedPoker).toBeTruthy();
      expect(basket.userData.warRoomHansBasketFinish).toBe('graphite-grey-v1');
      expect(hans.visible).toBe(true);

      const baseScale = fireCore.scale.clone();
      const baseIntensity = Number(fireLight.userData.baseWarRoomIntensity || fireLight.intensity);
      const baseDistance = fireLight.distance;
      const baseBounce = bounce?.intensity ?? null;

      driver.onBeforeRender();

      now.mockReturnValue(4676); // ~=2.5 s presentación
      driver.onBeforeRender();
      expect(driver.userData.warRoomHansPhase).toBe('fire-dimming');
      expect(hans.visible).toBe(true);
      expect(fireCore.scale.y).toBeLessThan(baseScale.y);
      expect(fireLight.intensity).toBeLessThan(baseIntensity);
      expect(fireLight.distance).toBeLessThan(baseDistance);
      if (bounce) expect(bounce.intensity).toBeLessThan(baseBounce);
      const dimmedFireHeight = fireCore.scale.y;

      now.mockReturnValue(13059); // ~=8.2 s presentación
      driver.onBeforeRender();
      expect(driver.userData.warRoomHansPhase).toBe('take-log');
      expect(basketTopLog.visible).toBe(false);
      expect(carriedLog.visible).toBe(true);
      expect(hans.userData.warRoomHansFacingTarget).toBe('basket');

      now.mockReturnValue(21000); // ~=13.6 s presentación
      driver.onBeforeRender();
      expect(driver.userData.warRoomHansPhase).toBe('place-log');
      expect(carriedLog.visible).toBe(false);
      expect(addedLog.visible).toBe(true);
      expect(hans.userData.warRoomHansFacingTarget).toBe('fire');

      now.mockReturnValue(24088); // ~=15.7 s presentación
      driver.onBeforeRender();
      expect(driver.userData.warRoomHansPhase).toBe('take-poker');
      expect(poker.visible).toBe(false);
      expect(carriedPoker.visible).toBe(true);
      expect(hans.userData.warRoomHansFacingTarget).toBe('tools');

      now.mockReturnValue(29676); // ~=19.5 s presentación
      driver.onBeforeRender();
      expect(driver.userData.warRoomHansPhase).toBe('stoke-fire');
      expect(carriedPoker.visible).toBe(true);
      expect(hans.userData.warRoomHansFacingTarget).toBe('fire');
      expect(fireCore.scale.y).toBeGreaterThan(dimmedFireHeight);

      now.mockReturnValue(35118); // ~=23.2 s presentación, settled after returning poker
      driver.onBeforeRender();
      expect(driver.userData.warRoomHansPhase).toBe('satisfied');
      expect(carriedPoker.visible).toBe(false);
      expect(poker.visible).toBe(true);
      expect(hans.userData.warRoomHansFacingTarget).toBe('fire');

      now.mockReturnValue(43647); // ~=29 s presentación, ya pasado el bypass
      driver.onBeforeRender();
      expect(driver.userData.warRoomHansPhase).toBe('leave');
      expect(hans.userData.warRoomHansRoute).toBe('leave-door');
      expect(door.userData.warRoomHansDoorOpen).toBeGreaterThan(0.5);
      expect(hans.visible).toBe(true);
      expect(hans.userData.warRoomHansFacingTarget).toBe('door');

      now.mockReturnValue(52471); // ~=35 s presentación
      driver.onBeforeRender();
      expect(driver.userData.warRoomHansPhase).toBe('complete');
      expect(driver.userData.warRoomHansCompleted).toBe(true);
      expect(driver.userData.warRoomHansHearthRestored).toBe(true);
      expect(fireplace.userData.warRoomHansHearthRestored).toBe(true);
      expect(hans.visible).toBe(false);
      expect(door.userData.warRoomHansDoorOpen).toBe(0);
      expect(fireCore.scale.x).toBeCloseTo(baseScale.x, 6);
      expect(fireCore.scale.y).toBeCloseTo(baseScale.y, 6);
      expect(fireCore.scale.z).toBeCloseTo(baseScale.z, 6);
      expect(fireLight.intensity).toBeCloseTo(baseIntensity, 6);
      expect(fireLight.distance).toBeCloseTo(baseDistance, 6);
      if (bounce) expect(bounce.intensity).toBeCloseTo(baseBounce, 6);
      expect(basketTopLog.visible).toBe(false);
      expect(addedLog.visible).toBe(true);
      expect(poker.visible).toBe(true);
    } finally {
      now.mockRestore();
      dispose(room);
    }
  });
});