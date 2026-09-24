import { describe, expect, it } from 'vitest';
import { buildWarRoom } from './Board3DScene.js';
import { buildPremiumWarRoomLayer } from './PremiumWarRoomScene.js';

const THEME = Object.freeze({
  felt: 0x173943,
  glow: 0xc5963f,
  frame: 0x2a160d,
  light: 0xd8c9a7,
  dark: 0x49372c,
});

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

describe('War Room v1 construction geometry sharing', () => {
  it('shares repeated base-room box geometry before first render', () => {
    const room = buildWarRoom(THEME, true, false);
    const posts = room.children.filter((object) => {
      const p = object.geometry?.parameters;
      return object.isMesh
        && object.geometry?.type === 'BoxGeometry'
        && p?.width === 0.16
        && p?.height === 4.7
        && p?.depth === 0.5;
    });

    expect(posts).toHaveLength(6);
    expect(new Set(posts.map((mesh) => mesh.geometry)).size).toBe(1);
    dispose(room);
  });

  it('shares repeated premium coffer geometry instead of allocating per mesh', () => {
    const room = buildPremiumWarRoomLayer(THEME, true, false);
    const panels = room.getObjectByName('coffered-paneling');
    const boxes = panels?.children.filter((object) => object.isMesh && object.geometry?.type === 'BoxGeometry') || [];

    expect(boxes.length).toBeGreaterThanOrEqual(20);
    expect(new Set(boxes.map((mesh) => mesh.geometry)).size).toBeLessThanOrEqual(6);
    dispose(room);
  });
});
