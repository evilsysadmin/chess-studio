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
  it('ilumina la pared y mantiene una envolvente naranja legible alrededor de un núcleo dorado menor', () => {
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
      expect(torch.userData.warRoomTorchFlameFinish).toBe('hearth-warm-v2');
      expect(halo).toBeInstanceOf(THREE.Mesh);
      expect(halo.material.opacity).toBeGreaterThanOrEqual(0.88);
      expect(halo.scale.x).toBeGreaterThanOrEqual(1.55);
      expect(halo.scale.y).toBeGreaterThanOrEqual(1.48);
      expect(halo.material.toneMapped).toBe(false);
      expect(innerHalo).toBeInstanceOf(THREE.Mesh);
      expect(innerHalo.material.opacity).toBeGreaterThanOrEqual(0.68);
      expect(innerHalo.material.toneMapped).toBe(false);

      expect(flame.material.color.getHex()).toBe(0xff5a08);
      expect(flame.material.emissive.getHex()).toBe(0xff1600);
      expect(flame.material.emissiveIntensity).toBeCloseTo(1.15, 2);
      expect(flame.material.toneMapped).toBe(false);
      expect(innerFlame.material.color.getHex()).toBe(0xffb83d);
      expect(innerFlame.material.emissive.getHex()).toBe(0xff4a08);
      expect(innerFlame.material.emissiveIntensity).toBeCloseTo(1.45, 2);
      expect(innerFlame.material.toneMapped).toBe(false);
      expect(embers.material.color.getHex()).toBe(0x8f1c06);
      expect(embers.material.emissive.getHex()).toBe(0xff2100);
      expect(embers.material.emissiveIntensity).toBeCloseTo(1.9, 2);
      expect(embers.material.toneMapped).toBe(false);
      expect(flame.userData.warRoomTorchFlamePulseHook).toBe('hearth-flame-pulse-v2');

      expect(light.color.getHex()).toBe(0xff7424);
      expect(light.distance).toBeGreaterThanOrEqual(10.5);
      expect(wallGlow.color.getHex()).toBe(0xffa442);
      expect(wallGlow.distance).toBeGreaterThanOrEqual(7.4);

      flame.onBeforeRender();
      expect(light.intensity).toBeGreaterThan(7.8);
      expect(wallGlow.intensity).toBeGreaterThan(5.7);
      expect(flame.scale.x).toBeGreaterThan(innerFlame.scale.x * 1.5);
      expect(flame.material.emissiveIntensity).toBeGreaterThanOrEqual(1.05);
      expect(flame.material.emissiveIntensity).toBeLessThanOrEqual(1.28);
      expect(innerFlame.material.emissiveIntensity).toBeGreaterThanOrEqual(1.35);
      expect(innerFlame.material.emissiveIntensity).toBeLessThanOrEqual(1.55);
    }

    expect(tuneWarRoomGalleryTorchWallWash(room)).toBe(0);
    dispose(room);
  });
});
