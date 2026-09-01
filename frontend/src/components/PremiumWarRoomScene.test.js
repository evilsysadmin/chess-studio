import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildPremiumTableLayer, buildPremiumWarRoomLayer } from './PremiumWarRoomScene.js';

function sceneStats(root) {
  const stats = { meshes: 0, lights: 0 };
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) stats.meshes += 1;
    if (object instanceof THREE.Light) stats.lights += 1;
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

  it('construye una sala de mando rica y reduce detalle geométrico en táctil', () => {
    const desktop = buildPremiumWarRoomLayer(theme, true, false);
    const mobile = buildPremiumWarRoomLayer(theme, true, true);
    const desktopStats = sceneStats(desktop);
    const mobileStats = sceneStats(mobile);

    expect(desktop.name).toBe('premium-war-room-layer');
    expect(desktop.userData.premiumWarRoom).toBe(true);
    expect(desktopStats.meshes).toBeGreaterThan(70);
    expect(desktopStats.lights).toBeGreaterThanOrEqual(4);
    expect(desktopStats.meshes).toBeGreaterThan(mobileStats.meshes);

    dispose(desktop);
    dispose(mobile);
  });

  it('añade al tablero un reveal de cuero, doble rail y herrajes de latón', () => {
    const table = buildPremiumTableLayer(theme, false);
    const stats = sceneStats(table);

    expect(table.name).toBe('premium-table-layer');
    expect(stats.meshes).toBeGreaterThanOrEqual(17);
    expect(stats.lights).toBe(0);

    dispose(table);
  });
});
