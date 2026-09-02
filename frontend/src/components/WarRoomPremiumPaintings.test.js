import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { addPremiumWarRoomPaintings } from './WarRoomPremiumPaintings.js';

function dispose(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root.traverse((object) => {
    if (object.geometry && !geometries.has(object.geometry)) {
      geometries.add(object.geometry);
      object.geometry.dispose?.();
    }
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) {
      if (!material || materials.has(material)) continue;
      materials.add(material);
      if (material.map && !textures.has(material.map)) {
        textures.add(material.map);
        material.map.dispose?.();
      }
      material.dispose?.();
    }
  });
}

describe('War Room premium paintings', () => {
  it('superpone dos lienzos pictóricos suaves con doble moldura en desktop', () => {
    const group = new THREE.Group();
    const count = addPremiumWarRoomPaintings(group, { wallZ: -7.6, towardBoard: 1, coarsePointer: false });

    expect(count).toBe(2);
    expect(group.userData.warRoomPremiumPaintings).toBe(2);

    for (const index of [0, 1]) {
      const painting = group.getObjectByName(`war-room-premium-painting-${index}`);
      const canvas = painting?.getObjectByName('war-room-premium-painting-canvas');
      const gilt = painting?.getObjectByName('war-room-premium-frame-gilt-bed');
      expect(painting).toBeInstanceOf(THREE.Group);
      expect(painting.userData.warRoomPaintingFinish).toBe('painterly-canvas-v1');
      expect(canvas).toBeInstanceOf(THREE.Mesh);
      expect(gilt).toBeInstanceOf(THREE.Mesh);
      expect(canvas.material.map).toBeInstanceOf(THREE.DataTexture);
      expect(canvas.material.map.userData.warRoomPainterly).toBe(true);
      expect(canvas.material.map.userData.resolution).toEqual([96, 64]);
      expect(canvas.material.roughness).toBeGreaterThan(0.7);
    }

    dispose(group);
  });

  it('no añade texturas pictóricas extra en coarse pointer/móvil', () => {
    const group = new THREE.Group();
    const count = addPremiumWarRoomPaintings(group, { wallZ: -7.6, towardBoard: 1, coarsePointer: true });
    expect(count).toBe(0);
    expect(group.children).toHaveLength(0);
    expect(group.userData.warRoomPremiumPaintings).toBeUndefined();
    dispose(group);
  });
});
