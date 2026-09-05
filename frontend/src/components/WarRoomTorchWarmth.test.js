import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { installWarRoomMilitaryGallery } from './WarRoomMilitaryGallery.js';
import { tuneWarRoomGalleryTorchWarmth } from './WarRoomPracticalLighting.js';

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
      for (const key of ['map', 'roughnessMap', 'bumpMap', 'normalMap', 'emissiveMap']) {
        const texture = material[key];
        if (texture && !textures.has(texture)) {
          textures.add(texture);
          texture.dispose?.();
        }
      }
      material.dispose?.();
    }
  });
}

describe('War Room gallery torch warmth', () => {
  it('convierte la antorcha en una fuente cálida perceptible y mantiene el boost durante el flicker', () => {
    const room = new THREE.Group();
    installWarRoomMilitaryGallery(room, { wallZ: -7.6, towardBoard: 1, coarsePointer: false });

    expect(tuneWarRoomGalleryTorchWarmth(room)).toBe(2);

    for (const side of ['left', 'right']) {
      const torch = room.getObjectByName(`war-room-side-torch-${side}`);
      const halo = torch.getObjectByName('war-room-side-torch-wall-halo');
      const innerHalo = torch.getObjectByName('war-room-side-torch-wall-halo-inner');
      const flame = torch.getObjectByName('war-room-side-torch-flame-outer');
      const light = torch.getObjectByName('war-room-side-torch-light');
      const wallGlow = torch.getObjectByName('war-room-side-torch-wall-glow');

      expect(halo.material.opacity).toBeGreaterThanOrEqual(0.8);
      expect(halo.scale.x).toBeGreaterThan(1.3);
      expect(innerHalo).toBeTruthy();
      expect(innerHalo.material.toneMapped).toBe(false);
      expect(flame.material.toneMapped).toBe(false);
      expect(light.color.getHex()).toBe(0xff7628);
      expect(wallGlow.color.getHex()).toBe(0xffa13f);
      expect(torch.userData.warRoomTorchLighting).toBe('gallery-spill-v2');
      expect(torch.userData.warRoomTorchWarmth).toBe('hearth-wash-v1');

      // The flame intentionally flickers below and above its nominal output.
      // Assert the boosted lower envelope rather than a single lucky phase.
      flame.onBeforeRender();
      expect(light.intensity).toBeGreaterThan(7.4);
      expect(wallGlow.intensity).toBeGreaterThan(4.8);
    }

    expect(tuneWarRoomGalleryTorchWarmth(room)).toBe(0);
    dispose(room);
  });
});
