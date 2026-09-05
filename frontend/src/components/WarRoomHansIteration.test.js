import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildPremiumWarRoomLayer } from './PremiumWarRoomScene.js';
import {
  hansQuickIterationFrame,
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

  it('empieza a apagar la chimenea inmediatamente y tarda cinco segundos', () => {
    const start = hansQuickIterationFrame(0);
    const middle = hansQuickIterationFrame(2.5);
    const almostOut = hansQuickIterationFrame(4.95);
    const hansArrives = hansQuickIterationFrame(5.1);

    expect(start.phase).toBe('fire-dimming');
    expect(start.fireScale).toBe(1);
    expect(middle.fireScale).toBeLessThan(1);
    expect(middle.fireScale).toBeGreaterThan(0.26);
    expect(almostOut.fireScale).toBeLessThan(0.28);
    expect(hansArrives.phase).toBe('walk-to-basket');
    expect(hansArrives.hansVisible).toBe(true);
    expect(hansArrives.fireScale).toBeCloseTo(0.26, 2);
  });

  it('instala Hans desde el finalizador cuando la chimenea ya existe en la sala real', () => {
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
    expect(hans).toBeTruthy();
    expect(driver).toBeTruthy();
    expect(driver.userData.warRoomHansSelected).toBe(true);
    expect(driver.userData.warRoomHansStartDelaySeconds).toBe(0);
    expect(driver.userData.warRoomHansQuickIteration).toBe('always-quick-v2');
    expect(fireplace.userData.warRoomHansQuickIteration).toBe('always-quick-v2');
    expect(fireplace.userData.warRoomHansHearthRestored).toBe(false);
    expect(typeof driver.onBeforeRender).toBe('function');

    dispose(room);
  });

  it('repone por completo fuego y luz, deja el tronco y devuelve el atizador', () => {
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

      expect(fireplace).toBeTruthy();
      expect(driver).toBeTruthy();
      expect(fireCore).toBeTruthy();
      expect(fireLight).toBeTruthy();
      expect(basketTopLog).toBeTruthy();
      expect(addedLog).toBeTruthy();
      expect(poker).toBeTruthy();

      const baseScale = fireCore.scale.clone();
      const baseIntensity = Number(fireLight.userData.baseWarRoomIntensity || fireLight.intensity);
      const baseDistance = fireLight.distance;
      const baseBounce = bounce?.intensity ?? null;

      now.mockReturnValue(3500);
      driver.onBeforeRender();
      expect(driver.userData.warRoomHansPhase).toBe('fire-dimming');
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
