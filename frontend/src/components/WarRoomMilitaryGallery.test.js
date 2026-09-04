import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildPremiumWarRoomLayer } from './PremiumWarRoomScene.js';

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

describe('War Room military gallery', () => {
  const theme = { felt: 0x173943, glow: 0xc5963f };

  it('reemplaza los paisajes centrales por lienzos militares del mock aprobado', () => {
    const room = buildPremiumWarRoomLayer(theme, true, false);
    const leftCanvas = room.getObjectByName('war-room-premium-painting-0')
      ?.getObjectByName('war-room-premium-painting-canvas');
    const rightCanvas = room.getObjectByName('war-room-premium-painting-1')
      ?.getObjectByName('war-room-premium-painting-canvas');

    expect(leftCanvas?.material?.map).toBeInstanceOf(THREE.DataTexture);
    expect(rightCanvas?.material?.map).toBeInstanceOf(THREE.DataTexture);
    expect(leftCanvas.material.map.userData.warRoomCampaignArt).toBe('command');
    expect(rightCanvas.material.map.userData.warRoomCampaignArt).toBe('victory');
    expect(leftCanvas.material.map.userData.source).toBe('approved-war-room-mock');
    expect(rightCanvas.material.map.userData.source).toBe('approved-war-room-mock');
    expect(room.userData.warRoomMilitaryGalleryCentralCanvases).toBe(2);

    dispose(room);
  });

  it('monta un lienzo militar discreto en cada pared lateral', () => {
    const room = buildPremiumWarRoomLayer(theme, true, false);
    const left = room.getObjectByName('war-room-campaign-painting-left');
    const right = room.getObjectByName('war-room-campaign-painting-right');

    expect(left).toBeInstanceOf(THREE.Group);
    expect(right).toBeInstanceOf(THREE.Group);
    expect(left.userData.warRoomCampaignArt).toBe('cavalry');
    expect(right.userData.warRoomCampaignArt).toBe('laurel');
    expect(left.getObjectByName('war-room-campaign-side-canvas')?.material?.map?.userData?.warRoomCampaignArt).toBe('cavalry');
    expect(right.getObjectByName('war-room-campaign-side-canvas')?.material?.map?.userData?.warRoomCampaignArt).toBe('laurel');
    expect(Math.abs(left.position.x)).toBeGreaterThan(7.5);
    expect(Math.abs(right.position.x)).toBeGreaterThan(7.5);
    expect(room.userData.warRoomMilitaryGallerySideCanvases).toBe(2);

    dispose(room);
  });

  it('añade dos antorchas laterales con llama y luz animadas sin sombras caras', () => {
    const room = buildPremiumWarRoomLayer(theme, true, false);

    for (const side of ['left', 'right']) {
      const torch = room.getObjectByName(`war-room-side-torch-${side}`);
      const flame = torch?.getObjectByName('war-room-side-torch-flame-outer');
      const light = torch?.getObjectByName('war-room-side-torch-light');

      expect(torch).toBeInstanceOf(THREE.Group);
      expect(flame).toBeInstanceOf(THREE.Mesh);
      expect(light).toBeInstanceOf(THREE.PointLight);
      expect(flame.userData.warRoomAnimatedTorch).toBe(true);
      expect(typeof flame.onBeforeRender).toBe('function');
      expect(light.castShadow).toBe(false);
      expect(() => flame.onBeforeRender()).not.toThrow();
    }
    expect(room.userData.warRoomMilitaryGalleryTorches).toBe(2);

    dispose(room);
  });

  it('conserva la ruta móvil simplificada sin cargar la galería pesada', () => {
    const room = buildPremiumWarRoomLayer(theme, true, true);
    expect(room.getObjectByName('war-room-campaign-painting-left')).toBeFalsy();
    expect(room.getObjectByName('war-room-campaign-painting-right')).toBeFalsy();
    expect(room.getObjectByName('war-room-side-torch-left')).toBeFalsy();
    expect(room.getObjectByName('war-room-side-torch-right')).toBeFalsy();
    dispose(room);
  });
});
