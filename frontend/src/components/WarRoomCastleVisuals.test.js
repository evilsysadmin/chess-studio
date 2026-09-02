import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildPremiumTableLayer, buildPremiumWarRoomLayer } from './PremiumWarRoomScene.js';

const theme = {
  felt: 0x173943,
  glow: 0xc5963f,
};

describe('War Room castle visual contract', () => {
  it('saca el atrezzo del tablero y lo lleva a consolas laterales', () => {
    const scene = new THREE.Scene();
    const room = buildPremiumWarRoomLayer(theme, true, false);
    const table = buildPremiumTableLayer(theme, false);
    scene.add(room);
    scene.add(table);

    expect(room.getObjectByName('war-room-side-console-left')).toBeTruthy();
    expect(room.getObjectByName('war-room-side-console-right')).toBeTruthy();
    expect(room.getObjectByName('war-room-console-field-folio')).toBeTruthy();
    expect(room.getObjectByName('war-room-console-command-chronometer')).toBeTruthy();
    expect(room.getObjectByName('war-room-console-matthias-relic')).toBeTruthy();
    expect(room.getObjectByName('war-room-console-map-pencil')).toBeTruthy();

    const driver = room.getObjectByName('war-room-castle-floor-slab');
    expect(driver?.userData?.warRoomCastleSceneDriver).toBe(true);
    expect(typeof driver?.onBeforeRender).toBe('function');
    driver.onBeforeRender();

    for (const name of [
      'war-table-field-folio',
      'war-table-map-pencil',
      'war-table-command-chronometer',
      'matthias-command-relic',
    ]) {
      const oldProp = table.getObjectByName(name);
      expect(oldProp).toBeTruthy();
      expect(oldProp.visible).toBe(false);
      expect(oldProp.userData.relocatedToRoomDecor).toBe(true);
    }
  });

  it('mantiene un fuego animado y cálido incluso en el perfil ligero', () => {
    const scene = new THREE.Scene();
    const room = buildPremiumWarRoomLayer(theme, true, true);
    scene.add(room);

    const driver = room.getObjectByName('war-room-castle-floor-slab');
    const fireCore = room.getObjectByName('war-room-fire-core');
    const fireLight = room.getObjectByName('war-room-fire-light');
    expect(driver).toBeTruthy();
    expect(fireCore).toBeTruthy();
    expect(fireLight).toBeTruthy();

    const flame = fireCore.children.find((child) => child?.isMesh);
    const before = flame.scale.y;
    driver.onBeforeRender();

    expect(fireCore.userData.warRoomWarmFireAnimated).toBe(true);
    expect(room.getObjectByName('war-room-fire-bounce-light')).toBeTruthy();
    expect(fireLight.intensity).toBeGreaterThan(0);
    expect(fireLight.color.r).toBeGreaterThan(fireLight.color.b);
    expect(flame.material.emissiveIntensity).toBeGreaterThan(0);
    expect(Number.isFinite(flame.scale.y)).toBe(true);
    expect(before).toBeGreaterThan(0);
  });

  it('aplica la pasada premium una sola vez y separa sofás, consolas y fuego', () => {
    const scene = new THREE.Scene();
    const room = buildPremiumWarRoomLayer(theme, true, false);
    scene.add(room);

    const premiumDriver = room.getObjectByName('war-room-castle-wall-left');
    expect(premiumDriver?.userData?.warRoomPremiumRoomDriver).toBe(true);
    expect(typeof premiumDriver?.onBeforeRender).toBe('function');
    premiumDriver.onBeforeRender();

    const leftSofa = room.getObjectByName('war-room-sofa-left');
    const leftConsole = room.getObjectByName('war-room-side-console-left');
    expect(leftSofa.userData.warRoomPremiumUpholstery).toBe('club-tufted-v2');
    expect(leftConsole.userData.warRoomPremiumConsole).toBe('campaign-table-v2');
    expect(Math.abs(leftSofa.userData.warRoomOffsetFromWall - leftConsole.userData.warRoomOffsetFromWall)).toBeGreaterThan(4);
    expect(room.getObjectByName('war-room-sofa-seat-cushion')).toBeTruthy();
    expect(room.getObjectByName('war-room-console-lower-shelf')).toBeTruthy();

    const fireCore = room.getObjectByName('war-room-fire-core');
    const flame = fireCore.children.find((child) => child?.isMesh);
    expect(fireCore.userData.warRoomPremiumFire).toBe('lathed-licks-v2');
    expect(flame.userData.warRoomPremiumFlame).toBe(true);
    expect(flame.geometry.type).toBe('LatheGeometry');
    expect(flame.material.blending).toBe(THREE.AdditiveBlending);

    const canvas = room.getObjectByName('war-room-premium-painting-canvas');
    expect(canvas.material.map.userData.resolution).toEqual([160, 112]);
    expect(room.userData.warRoomPremiumCoherence).toBe('v2');
  });
});
