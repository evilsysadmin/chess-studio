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

  it('saca a Hans por su puerta desde el segundo cero mientras apaga la chimenea', () => {
    const start = hansQuickIterationFrame(0);
    const middle = hansQuickIterationFrame(2.5);
    const almostAtBasket = hansQuickIterationFrame(4.95);
    const takeLog = hansQuickIterationFrame(5.1);

    expect(start.phase).toBe('fire-dimming');
    expect(start.fireScale).toBe(1);
    expect(start.hansVisible).toBe(true);
    expect(start.hansX).toBeCloseTo(2.65, 2);
    expect(start.doorOpen).toBe(1);

    expect(middle.fireScale).toBeLessThan(1);
    expect(middle.fireScale).toBeGreaterThan(0.26);
    expect(middle.hansVisible).toBe(true);
    expect(middle.hansX).toBeLessThan(start.hansX);
    expect(middle.doorOpen).toBeLessThanOrEqual(1);

    expect(almostAtBasket.fireScale).toBeLessThan(0.28);
    expect(almostAtBasket.hansVisible).toBe(true);
    expect(almostAtBasket.hansX).toBeCloseTo(1.95, 1);
    expect(almostAtBasket.doorOpen).toBeLessThan(0.02);

    expect(takeLog.phase).toBe('take-log');
    expect(takeLog.hansVisible).toBe(true);
    expect(takeLog.fireScale).toBeCloseTo(0.26, 2);
    expect(takeLog.doorOpen).toBe(0);
  });

  it('instala Hans ya visible y la puerta abierta antes del primer frame útil', () => {
    setWarRoomHansQuickIterationEnabled(true);
    expect(isWarRoomHansQuickIterationEnabled()).toBe(true);

    const room = buildPremiumWarRoomLayer({ felt: 0x173943, glow: 0xc5963f }, true, false);
    expect(room.getObjectByName('war-room-fireplace')).toBeTruthy();
    expect(room.getObjectByName('war-room-hans-butler')).toBeFalsy();

    const finalizerDriver = room.getObjectByName('war-room-premium-painting-canvas');
    expect(typeof finalizerDriver?.onBeforeRender).toBe('function');
    finalizerDriver.onBeforeRender();

    const hans = room.getObjectByName('war-room-hans-butler');
    const driver = room.getObjectByName('war-room-hans-fireplace-driver');
    const fireplace = room.getObjectByName('war-room-fireplace');
    const door = room.getObjectByName('war-room-hans-service-door');
    const doorPivot = room.getObjectByName('war-room-hans-service-door-pivot');
    const handle = room.getObjectByName('war-room-hans-service-door-handle');

    expect(hans).toBeTruthy();
    expect(driver).toBeTruthy();
    expect(door).toBeTruthy();
    expect(doorPivot).toBeTruthy();
    expect(handle).toBeTruthy();
    expect(driver.userData.warRoomHansSelected).toBe(true);
    expect(driver.userData.warRoomHansStartDelaySeconds).toBe(0);
    expect(driver.userData.warRoomHansQuickIteration).toBe('always-quick-v4-door');
    expect(driver.userData.warRoomHansVisibleAtStart).toBe(true);
    expect(driver.userData.warRoomHansUsesServiceDoor).toBe(true);
    expect(fireplace.userData.warRoomHansQuickIteration).toBe('always-quick-v4-door');
    expect(fireplace.userData.warRoomHansHearthRestored).toBe(false);
    expect(door.userData.warRoomHansServiceDoor).toBe('hans-service-door-v1');
    expect(door.userData.warRoomHansDoorOpen).toBe(1);
    expect(Math.abs(doorPivot.rotation.y)).toBeGreaterThan(0.8);
    expect(hans.visible).toBe(true);
    expect(Math.abs(hans.position.x)).toBeCloseTo(2.65, 2);
    expect(typeof driver.onBeforeRender).toBe('function');

    dispose(room);
  });

  it('fuerza la misma entrada visible en dispositivos táctiles durante la iteración', () => {
    setWarRoomHansQuickIterationEnabled(true);
    const room = buildPremiumWarRoomLayer({ felt: 0x173943, glow: 0xc5963f }, true, true);

    try {
      // Mobile intentionally skips the desktop deferred museum finalizer, so
      // exercise the shared scene routine directly with the real coarse flag.
      expect(installWarRoomHansSceneRoutine(room, { towardBoard: 1, coarsePointer: true })).toBeGreaterThan(0);

      const hans = room.getObjectByName('war-room-hans-butler');
      const driver = room.getObjectByName('war-room-hans-fireplace-driver');
      const door = room.getObjectByName('war-room-hans-service-door');

      expect(hans).toBeTruthy();
      expect(driver).toBeTruthy();
      expect(door).toBeTruthy();
      expect(driver.userData.warRoomHansSelected).toBe(true);
      expect(driver.userData.warRoomHansQuickIteration).toBe('always-quick-v4-door');
      expect(driver.userData.warRoomHansVisibleAtStart).toBe(true);
      expect(hans.visible).toBe(true);
      expect(door.userData.warRoomHansDoorOpen).toBe(1);
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
      expect(room.getObjectByName('war-room-hans-butler')).toBeFalsy();
      expect(room.getObjectByName('war-room-hans-fireplace-driver')).toBeFalsy();
    } finally {
      dispose(room);
    }
  });

  it('cierra la puerta dentro, la reabre para salir y oculta a Hans al cruzar el umbral', () => {
    const now = vi.spyOn(globalThis.performance, 'now').mockReturnValue(1000);
    setWarRoomHansQuickIterationEnabled(true);
    const room = buildPremiumWarRoomLayer({ felt: 0x173943, glow: 0xc5963f }, true, false);

    try {
      const finalizerDriver = room.getObjectByName('war-room-premium-painting-canvas');
      finalizerDriver.onBeforeRender();
      const hans = room.getObjectByName('war-room-hans-butler');
      const driver = room.getObjectByName('war-room-hans-fireplace-driver');
      const door = room.getObjectByName('war-room-hans-service-door');

      expect(door.userData.warRoomHansDoorOpen).toBe(1);

      now.mockReturnValue(6100);
      driver.onBeforeRender();
      expect(driver.userData.warRoomHansPhase).toBe('take-log');
      expect(door.userData.warRoomHansDoorOpen).toBe(0);
      expect(hans.visible).toBe(true);

      now.mockReturnValue(27000);
      driver.onBeforeRender();
      expect(driver.userData.warRoomHansPhase).toBe('leave');
      expect(door.userData.warRoomHansDoorOpen).toBeGreaterThan(0.9);
      expect(hans.visible).toBe(false);
    } finally {
      now.mockRestore();
      dispose(room);
    }
  });

  it('repone por completo fuego y luz, deja el tronco, devuelve el atizador y cierra la puerta', () => {
    const now = vi.spyOn(globalThis.performance, 'now').mockReturnValue(1000);
    setWarRoomHansQuickIterationEnabled(true);
    const room = buildPremiumWarRoomLayer({ felt: 0x173943, glow: 0xc5963f }, true, false);

    try {
      const finalizerDriver = room.getObjectByName('war-room-premium-painting-canvas');
      finalizerDriver.onBeforeRender();

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

      expect(fireplace).toBeTruthy();
      expect(driver).toBeTruthy();
      expect(fireCore).toBeTruthy();
      expect(fireLight).toBeTruthy();
      expect(basketTopLog).toBeTruthy();
      expect(addedLog).toBeTruthy();
      expect(poker).toBeTruthy();
      expect(door).toBeTruthy();
      expect(hans.visible).toBe(true);

      const baseScale = fireCore.scale.clone();
      const baseIntensity = Number(fireLight.userData.baseWarRoomIntensity || fireLight.intensity);
      const baseDistance = fireLight.distance;
      const baseBounce = bounce?.intensity ?? null;

      now.mockReturnValue(3500);
      driver.onBeforeRender();
      expect(driver.userData.warRoomHansPhase).toBe('fire-dimming');
      expect(hans.visible).toBe(true);
      expect(fireCore.scale.y).toBeLessThan(baseScale.y);
      expect(fireLight.intensity).toBeLessThan(baseIntensity);
      expect(fireLight.distance).toBeLessThan(baseDistance);
      if (bounce) expect(bounce.intensity).toBeLessThan(baseBounce);

      now.mockReturnValue(36000);
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
