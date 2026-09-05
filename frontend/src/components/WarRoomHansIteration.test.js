import { afterEach, describe, expect, it } from 'vitest';
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
    expect(driver.userData.warRoomHansQuickIteration).toBe('always-quick-v1');
    expect(fireplace.userData.warRoomHansQuickIteration).toBe('always-quick-v1');
    expect(typeof driver.onBeforeRender).toBe('function');

    dispose(room);
  });
});
