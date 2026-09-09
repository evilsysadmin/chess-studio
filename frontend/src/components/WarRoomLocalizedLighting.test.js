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

describe('War Room localized practical lighting', () => {
  it('extends the existing torch spill onto side canvases and armor without adding lights', () => {
    const room = new THREE.Group();
    addPremiumWarRoomPaintings(room, { wallZ: -7.6, towardBoard: 1, coarsePointer: false });

    const torchLights = [];
    room.traverse((object) => {
      if (object.name === 'war-room-side-torch-light') torchLights.push(object);
    });
    expect(torchLights).toHaveLength(2);

    for (const light of torchLights) {
      expect(light).toBeInstanceOf(THREE.PointLight);
      expect(light.distance).toBeGreaterThanOrEqual(13.2);
      expect(light.intensity).toBeGreaterThan(14);
    }

    for (const side of ['left', 'right']) {
      const painting = room.getObjectByName(`war-room-campaign-painting-${side}`);
      const canvas = painting?.getObjectByName('war-room-campaign-side-canvas');
      expect(painting?.userData?.warRoomPracticalMaterialPass).toBe('v4');
      expect(canvas).toBeInstanceOf(THREE.Mesh);
      expect(canvas.material.userData.warRoomPracticalFinish).toBe('museum-canvas-local-spill-v4');
      expect(canvas.material.roughness).toBeLessThanOrEqual(0.66);
      expect(canvas.material.clearcoat).toBeGreaterThanOrEqual(0.1);
      expect(canvas.material.specularIntensity).toBeGreaterThanOrEqual(0.24);
      expect(canvas.material.emissiveIntensity || 0).toBe(0);
    }

    for (const side of ['left', 'right']) {
      const armor = room.getObjectByName(`war-room-teutonic-armor-${side}`);
      const breastplate = armor?.getObjectByName('war-room-armor-breastplate');
      expect(breastplate).toBeInstanceOf(THREE.Mesh);
      expect(breastplate.material.specularIntensity).toBeGreaterThanOrEqual(0.7);
      expect(breastplate.material.clearcoat).toBeGreaterThanOrEqual(0.2);
      expect(breastplate.material.emissiveIntensity || 0).toBe(0);
    }

    dispose(room);
  });
});
