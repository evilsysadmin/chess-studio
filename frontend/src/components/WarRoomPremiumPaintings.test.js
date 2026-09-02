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

describe('War Room premium paintings', () => {
  it('superpone dos lienzos con acabado museo y decorado teutón premium en desktop', () => {
    const group = new THREE.Group();
    const count = addPremiumWarRoomPaintings(group, { wallZ: -7.6, towardBoard: 1, coarsePointer: false });

    expect(count).toBe(2);
    expect(group.userData.warRoomPremiumPaintings).toBe(2);
    expect(group.userData.warRoomPremiumPaintingVersion).toBe('v2');
    expect(group.userData.warRoomPremiumFinishVersion).toBe('museum-gothic-v3');
    expect(group.userData.warRoomPremiumFinishedObjects).toBe(4);
    expect(group.userData.warRoomTeutonicArmorCount).toBe(2);
    expect(group.userData.warRoomTeutonicStyle).toBe('smoked-rhenish-gothic-v2');
    expect(group.getObjectByName('war-room-teutonic-masonry')).toBeTruthy();
    expect(group.getObjectByName('war-room-teutonic-armor-left')).toBeTruthy();
    expect(group.getObjectByName('war-room-teutonic-armor-right')).toBeTruthy();

    for (const index of [0, 1]) {
      const painting = group.getObjectByName(`war-room-premium-painting-${index}`);
      const canvas = painting?.getObjectByName('war-room-premium-painting-canvas');
      const gilt = painting?.getObjectByName('war-room-premium-frame-gilt-bed');
      const woodBed = painting?.getObjectByName('war-room-premium-frame-wood-bed');
      const lamp = painting?.getObjectByName(`war-room-picture-lamp-${index}`);
      expect(painting).toBeInstanceOf(THREE.Group);
      expect(painting.userData.warRoomPaintingFinish).toBe('museum-canvas-and-gilding-v3');
      expect(painting.userData.warRoomMuseumFinish).toBe('v3');
      expect(painting.userData.warRoomGalleryFinish).toBe('lit-carved-frame-v3');
      expect(canvas).toBeInstanceOf(THREE.Mesh);
      expect(gilt).toBeInstanceOf(THREE.Mesh);
      expect(woodBed).toBeInstanceOf(THREE.Mesh);
      expect(canvas.material.map).toBeInstanceOf(THREE.DataTexture);
      expect(canvas.material.map.userData.warRoomPainterly).toBe(true);
      expect(canvas.material.map.userData.warRoomPaintingDetail).toBe('layered-landscape-v2');
      expect(canvas.material.map.userData.resolution).toEqual([160, 112]);
      expect(canvas.material.roughness).toBeGreaterThan(0.7);
      expect(canvas.material.bumpMap?.userData?.warRoomPremiumSurface).toBe('canvas');
      expect(canvas.material.userData.warRoomCanvasFinish).toBe('woven-varnished-linen-v3');
      expect(gilt.material.bumpMap?.userData?.warRoomPremiumSurface).toBe('gilding');
      expect(gilt.material.userData.warRoomFrameFinish).toBe('aged-water-gilding-v3');
      expect(woodBed.material.bumpMap?.userData?.warRoomPremiumSurface).toBe('wood');
      expect(woodBed.material.userData.warRoomFrameFinish).toBe('hand-rubbed-walnut-v3');
      expect(painting.getObjectByName('war-room-premium-frame-gilt-bead')).toBeTruthy();
      expect(painting.getObjectByName('war-room-premium-frame-leaf-ornament')).toBeTruthy();
      expect(painting.getObjectByName('war-room-painting-varnish')).toBeTruthy();
      expect(lamp?.userData?.warRoomPictureLamp).toBe('brass-gallery-lamp-v3');
      expect(lamp?.getObjectByName('war-room-picture-lamp-glow')).toBeTruthy();
      expect(painting.getObjectByName(`war-room-picture-plaque-${index}`)).toBeTruthy();
    }

    dispose(group);
  });

  it('no añade geometría premium extra en coarse pointer/móvil', () => {
    const group = new THREE.Group();
    const count = addPremiumWarRoomPaintings(group, { wallZ: -7.6, towardBoard: 1, coarsePointer: true });
    expect(count).toBe(0);
    expect(group.children).toHaveLength(0);
    expect(group.userData.warRoomPremiumPaintings).toBeUndefined();
    expect(group.userData.warRoomPremiumFinishVersion).toBeUndefined();
    expect(group.userData.warRoomTeutonicArmorCount).toBeUndefined();
    dispose(group);
  });
});
