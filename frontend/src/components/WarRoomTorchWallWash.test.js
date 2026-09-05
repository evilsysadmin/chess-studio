import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { installWarRoomMilitaryGallery } from './WarRoomMilitaryGallery.js';
import { tuneWarRoomGalleryTorchWallWash } from './WarRoomPracticalLighting.js';

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

describe('War Room torch wall wash', () => {
  it('ilumina la pared y mantiene una llama viva, cálida y saturada durante el flicker', () => {
    const room = new THREE.Group();
    installWarRoomMilitaryGallery(room, { wallZ: -7.6, towardBoard: 1, coarsePointer: false });

    expect(tuneWarRoomGalleryTorchWallWash(room)).toBe(2);

    for (const side of ['left', 'right']) {
      const torch = room.getObjectByName(`war-room-side-torch-${side}`);
      const halo = torch.getObjectByName('war-room-side-torch-wall-halo');
      const innerHalo = torch.getObjectByName('war-room-side-torch-wall-halo-inner');
      const flame = torch.getObjectByName('war-room-side-torch-flame-outer');
      const innerFlame = torch.getObjectByName('war-room-side-torch-flame-inner');
      const embers = torch.getObjectByName('war-room-side-torch-embers');
      const light = torch.getObjectByName('war-room-side-torch-light');
      const wallGlow = torch.getObjectByName('war-room-side-torch-wall-glow');

      expect(torch.userData.warRoomTorchWallWash).toBe('hearth-contour-v2');
      expect(torch.userData.warRoomTorchFlameFinish).toBe('hearth-warm-v1');
      expect(halo).toBeInstanceOf(THREE.Mesh);
      expect(halo.material.opacity).toBeGreaterThanOrEqual(0.88);
      expect(halo.scale.x).toBeGreaterThanOrEqual(1.55);
      expect(halo.scale.y).toBeGreaterThanOrEqual(1.48);
      expect(halo.material.toneMapped).toBe(false);
      expect(innerHalo).toBeInstanceOf(THREE.Mesh);
      expect(innerHalo.material.opacity).toBeGreaterThanOrEqual(0.68);
      expect(innerHalo.material.toneMapped).toBe(false);

      expect(flame.material.color.getHex()).toBe(0xff7a18);
      expect(flame.material.emissive.getHex()).toBe(0xff1600);
      expect(flame.material.emissiveIntensity).toBeGreaterThanOrEqual(4.9);
      expect(flame.material.toneMapped).toBe(false);
      expect(innerFlame.material.color.getHex()).toBe(0xffd15f);
      expect(innerFlame.material.emissive.getHex()).toBe(0xff2400);
      expect(innerFlame.material.emissiveIntensity).toBeGreaterThanOrEqual(6.4);
      expect(innerFlame.material.toneMapped).toBe(false);
      expect(embers.material.emissive.getHex()).toBe(0xff1300);
      expect(embers.material.emissiveIntensity).toBeGreaterThanOrEqual(3);
      expect(embers.material.toneMapped).toBe(false);
      expect(flame.userData.warRoomTorchFlamePulseHook).toBe('hearth-flame-pulse-v1');

      expect(light.color.getHex()).toBe(0xff7424);
      expect(light.distance).toBeGreaterThanOrEqual(10.5);
      expect(wallGlow.color.getHex()).toBe(0xffa442);
      expect(wallGlow.distance).toBeGreaterThanOrEqual(7.4);

      flame.onBeforeRender();
      expect(light.intensity).toBeGreaterThan(7.8);
      expect(wallGlow.intensity).toBeGreaterThan(5.7);
      expect(flame.material.emissiveIntensity).toBeGreaterThanOrEqual(4.5);
      expect(flame.material.emissiveIntensity).toBeLessThanOrEqual(5.4);
      expect(innerFlame.material.emissiveIntensity).toBeGreaterThanOrEqual(6);
      expect(innerFlame.material.emissiveIntensity).toBeLessThanOrEqual(6.7);
    }

    expect(tuneWarRoomGalleryTorchWallWash(room)).toBe(0);
    dispose(room);
  });
});
