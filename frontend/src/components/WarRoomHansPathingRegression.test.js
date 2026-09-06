import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPremiumWarRoomLayer } from './PremiumWarRoomScene.js';
import {
  hansQuickIterationFrame,
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

function facingDotToPoint(hans, point, towardBoard) {
  const dx = point.x - hans.position.x;
  const dz = point.z - hans.position.z;
  const distance = Math.hypot(dx, dz);
  const forwardSign = towardBoard < 0 ? -1 : 1;
  const faceX = Math.sin(hans.rotation.y) * forwardSign;
  const faceZ = Math.cos(hans.rotation.y) * forwardSign;
  return ((faceX * dx) + (faceZ * dz)) / distance;
}

afterEach(() => {
  setWarRoomHansQuickIterationEnabled(false);
  vi.restoreAllMocks();
});

describe('Hans hearth pathing regressions', () => {
  it.each([1, -1])('gira hacia la chimenea antes de caminar con el tronco y respeta el reloj lento (towardBoard=%s)', (towardBoard) => {
    const now = vi.spyOn(globalThis.performance, 'now').mockReturnValue(1000);
    setWarRoomHansQuickIterationEnabled(true);
    const room = buildPremiumWarRoomLayer(
      { felt: 0x173943, glow: 0xc5963f },
      towardBoard > 0,
      true,
    );

    try {
      expect(installWarRoomHansSceneRoutine(room, { towardBoard, coarsePointer: true })).toBeGreaterThan(0);
      const hans = room.getObjectByName('war-room-hans-butler');
      const driver = room.getObjectByName('war-room-hans-fireplace-driver');
      const firePoint = { x: 0, z: towardBoard * 0.31 };

      driver.onBeforeRender(); // clock origin

      now.mockReturnValue(11000); // 10 s reales -> 6.8 s de presentación: aún entrando
      driver.onBeforeRender();
      expect(driver.userData.warRoomHansPhase).toBe('fire-dimming');
      expect(driver.userData.warRoomHansPresentationTimeScale).toBeCloseTo(0.68, 6);

      now.mockReturnValue(14310); // ~=9.05 s de presentación => inicio carry-log
      driver.onBeforeRender();
      expect(driver.userData.warRoomHansPhase).toBe('carry-log');
      expect(hans.userData.warRoomHansFacingTarget).toBe('hearth');
      expect(hans.userData.refs.carriedLog.visible).toBe(true);
      expect(Math.abs(hans.userData.refs.leftLeg.rotation.x)).toBeLessThan(0.001);
      expect(facingDotToPoint(hans, firePoint, towardBoard)).toBeGreaterThan(0.8);
      const turnX = hans.position.x;

      now.mockReturnValue(15120); // ~=9.6 s de presentación: ya camina
      driver.onBeforeRender();
      expect(Math.abs(hans.position.x - turnX)).toBeGreaterThan(0.03);
      expect(facingDotToPoint(hans, firePoint, towardBoard)).toBeGreaterThan(0.8);
    } finally {
      dispose(room);
    }
  });

  it('rebaja la cadencia al atizador y evita el latigazo de vuelta hacia el fuego', () => {
    const beforeTurn = hansQuickIterationFrame(14.1);
    const afterTurn = hansQuickIterationFrame(14.25);
    const outboundMid = hansQuickIterationFrame(15.0);
    const atTools = hansQuickIterationFrame(15.95);
    const returnEarly = hansQuickIterationFrame(16.4);

    expect(beforeTurn.phase).toBe('take-poker');
    expect(afterTurn.phase).toBe('take-poker');
    expect(afterTurn.hansX).toBeCloseTo(beforeTurn.hansX, 5);
    expect(Math.abs(afterTurn.stride)).toBeLessThan(0.001);
    expect(outboundMid.hansX).toBeLessThan(afterTurn.hansX);
    expect(Math.abs(outboundMid.stride)).toBeLessThanOrEqual(0.121);
    expect(atTools.hansX).toBeLessThan(outboundMid.hansX);
    expect(returnEarly.phase).toBe('stoke-fire');
    expect(Math.abs(returnEarly.hansX - atTools.hansX)).toBeLessThan(0.6);
    expect(Math.abs(returnEarly.stride)).toBeLessThanOrEqual(0.121);
  });

  it('sale por un carril interior, rebasa la armadura y solo entonces vuelve a la puerta', () => {
    const sideStage = hansQuickIterationFrame(25.5);
    const bypassStage = hansQuickIterationFrame(27.0);
    const doorStage = hansQuickIterationFrame(29.0);

    expect(sideStage.phase).toBe('leave');
    expect(sideStage.route).toBe('leave-side');
    expect(sideStage.facingTarget).toBe('bypass-side');
    expect(sideStage.hansX).toBeLessThan(1.42);

    expect(bypassStage.phase).toBe('leave');
    expect(bypassStage.route).toBe('leave-bypass');
    expect(bypassStage.facingTarget).toBe('bypass-forward');
    expect(bypassStage.hansX).toBeCloseTo(1.42, 6);

    expect(doorStage.phase).toBe('leave');
    expect(doorStage.route).toBe('leave-door');
    expect(doorStage.facingTarget).toBe('door');
    expect(doorStage.hansX).toBeGreaterThan(1.42);
    expect(doorStage.doorOpen).toBeGreaterThan(0);
  });
});
