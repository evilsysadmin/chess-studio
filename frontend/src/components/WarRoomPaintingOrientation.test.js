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
      for (const value of Object.values(material)) {
        if (!value?.isTexture || textures.has(value)) continue;
        textures.add(value);
        value.dispose?.();
      }
      material.dispose?.();
    }
  });
}

function galleryCanvases(group) {
  return [
    group.getObjectByName('war-room-premium-painting-0')?.getObjectByName('war-room-premium-painting-canvas'),
    group.getObjectByName('war-room-premium-painting-1')?.getObjectByName('war-room-premium-painting-canvas'),
    group.getObjectByName('war-room-campaign-painting-left')?.getObjectByName('war-room-campaign-side-canvas'),
    group.getObjectByName('war-room-campaign-painting-right')?.getObjectByName('war-room-campaign-side-canvas'),
  ];
}

describe('War Room gallery painting orientation', () => {
  it('mantiene los cuatro cuadros militares boca arriba incluso tras el finalizador diferido', () => {
    const room = new THREE.Group();
    addPremiumWarRoomPaintings(room, { wallZ: -7.6, towardBoard: 1, coarsePointer: false });

    const canvases = galleryCanvases(room);
    expect(canvases.every(Boolean)).toBe(true);
    for (const canvas of canvases) {
      expect(canvas.material.map.userData.warRoomCampaignArt).toBeTruthy();
      expect(canvas.material.map.flipY).toBe(true);
      expect(canvas.material.map.userData.warRoomPaintingOrientation).toBe('upright-texture-v1');
    }

    // Reproduce the regression just before first paint: a late pass leaves one
    // campaign DataTexture with Three.js' default vertical orientation.
    const first = canvases[0];
    first.material.map.flipY = false;
    delete first.material.map.userData.warRoomPaintingOrientation;

    expect(typeof first.onBeforeRender).toBe('function');
    first.onBeforeRender();

    expect(first.material.map.flipY).toBe(true);
    expect(first.material.map.userData.warRoomPaintingOrientation).toBe('upright-texture-v1');
    expect(room.userData.warRoomDeferredFinalizedTasks).toContain('gallery-painting-orientation-upright-v1');

    dispose(room);
  });
});
