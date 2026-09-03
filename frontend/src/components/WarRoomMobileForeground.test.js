import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildPremiumWarRoomLayer } from './PremiumWarRoomScene.js';

const theme = {
  felt: 0x173943,
  glow: 0xc5963f,
};

function finalizeMobileRoom(whiteSide) {
  const scene = new THREE.Scene();
  const room = buildPremiumWarRoomLayer(theme, whiteSide, true);
  scene.add(room);

  const driver = room.getObjectByName('war-room-castle-wall-left');
  expect(driver?.userData?.warRoomDeferredFinalizer).toBe('deferred-finalizer-v1');
  expect(typeof driver?.onBeforeRender).toBe('function');
  driver.onBeforeRender();

  return { scene, room };
}

describe('War Room mobile foreground composition', () => {
  it.each([
    ['blancas al fondo', true, 1],
    ['negras al fondo', false, -1],
  ])('mantiene los sofás dentro del safe-frame delantero con %s', (_label, whiteSide, zSign) => {
    const { scene, room } = finalizeMobileRoom(whiteSide);
    const left = room.getObjectByName('war-room-sofa-left');
    const right = room.getObjectByName('war-room-sofa-right');

    expect(left).toBeTruthy();
    expect(right).toBeTruthy();
    expect(scene.userData.warRoomPremiumCoherence).toBe('v5-mobile-foreground');
    expect(scene.userData.warRoomDeferredFinalizedTasks).toContain('premium-room-pass-v4');

    expect(left.position.x).toBeCloseTo(-4.75, 5);
    expect(right.position.x).toBeCloseTo(4.75, 5);
    expect(Math.sign(left.position.z)).toBe(zSign);
    expect(Math.sign(right.position.z)).toBe(zSign);
    expect(Math.abs(left.position.z)).toBeCloseTo(1.75, 5);
    expect(Math.abs(right.position.z)).toBeCloseTo(1.75, 5);

    expect(left.userData.warRoomOffsetFromWall).toBeCloseTo(9.35, 5);
    expect(right.userData.warRoomOffsetFromWall).toBeCloseTo(9.35, 5);
    expect(left.userData.warRoomFurniturePlacement).toBe('mobile-foreground-safe-frame-v5');
    expect(right.userData.warRoomFurniturePlacement).toBe('mobile-foreground-safe-frame-v5');
    expect(left.userData.facesWarTable).toBe(true);
    expect(right.userData.facesWarTable).toBe(true);
    expect(Math.abs(left.rotation.y)).toBeGreaterThan(0.6);
    expect(Math.abs(right.rotation.y)).toBeGreaterThan(0.6);
    expect(Math.sign(left.rotation.y)).toBe(-Math.sign(right.rotation.y));

    expect(scene.userData.warRoomMobileForegroundSofaX).toBeCloseTo(4.75, 5);
    expect(scene.userData.warRoomMobileForegroundSofaOffset).toBeCloseTo(9.35, 5);
  });
});
