import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildPremiumTableLayer, buildPremiumWarRoomLayer } from './PremiumWarRoomScene.js';

function sceneStats(root) {
  const stats = { meshes: 0, lights: 0, spotLights: 0 };
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) stats.meshes += 1;
    if (object instanceof THREE.Light) stats.lights += 1;
    if (object instanceof THREE.SpotLight) stats.spotLights += 1;
  });
  return stats;
}

function dispose(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse((object) => {
    if (object.geometry && !geometries.has(object.geometry)) {
      geometries.add(object.geometry);
      object.geometry.dispose?.();
    }
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const item of list) {
      if (!item || materials.has(item)) continue;
      materials.add(item);
      item.dispose?.();
    }
  });
}

describe('PremiumWarRoomScene', () => {
  const theme = { felt: 0x173943, glow: 0xc5963f };

  it('construye la sala teutónica con cortinas, chimenea, cuadro y luz cálida', () => {
    const desktop = buildPremiumWarRoomLayer(theme, true, false);
    const mobile = buildPremiumWarRoomLayer(theme, true, true);
    const desktopStats = sceneStats(desktop);
    const mobileStats = sceneStats(mobile);

    expect(desktop.name).toBe('premium-war-room-layer');
    expect(desktop.userData.premiumWarRoom).toBe(true);
    expect(desktop.userData.premiumPass).toBe('cinematic-v3-teutonic');
    expect(desktop.getObjectByName('coffered-paneling')).toBeTruthy();
    expect(desktop.getObjectByName('ceremonial-pawn-crest')).toBeTruthy();
    expect(desktop.getObjectByName('command-cabinet')).toBeTruthy();
    expect(desktop.getObjectByName('war-room-fireplace')).toBeTruthy();
    expect(desktop.getObjectByName('war-room-velvet-curtain-fold')).toBeTruthy();
    expect(desktop.getObjectByName('war-room-sconce-flame')).toBeTruthy();
    expect(desktopStats.meshes).toBeGreaterThan(100);
    expect(desktopStats.lights).toBeGreaterThanOrEqual(6);
    expect(desktopStats.spotLights).toBeGreaterThanOrEqual(1);
    expect(desktopStats.meshes).toBeGreaterThan(mobileStats.meshes);

    dispose(desktop);
    dispose(mobile);
  });

  it('añade a la mesa cuero, doble rail, latón e inlay verde de mando', () => {
    const table = buildPremiumTableLayer(theme, false);
    const stats = sceneStats(table);

    expect(table.name).toBe('premium-table-layer');
    expect(table.userData.premiumPass).toBe('cinematic-v3-teutonic');
    expect(table.getObjectByName('emerald-table-inlay')).toBeTruthy();
    expect(stats.meshes).toBeGreaterThanOrEqual(25);
    expect(stats.lights).toBe(0);

    dispose(table);
  });
});
