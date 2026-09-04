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

function galleryOwner(room) {
  return room.getObjectByName('war-room-castle-architecture');
}

describe('War Room military gallery', () => {
  const theme = { felt: 0x173943, glow: 0xc5963f };

  it('reemplaza los paisajes centrales y conserva los lienzos militares tras el primer paint', () => {
    const room = buildPremiumWarRoomLayer(theme, true, false);
    const owner = galleryOwner(room);
    const left = room.getObjectByName('war-room-premium-painting-0');
    const right = room.getObjectByName('war-room-premium-painting-1');
    const leftCanvas = left?.getObjectByName('war-room-premium-painting-canvas');
    const rightCanvas = right?.getObjectByName('war-room-premium-painting-canvas');

    expect(leftCanvas?.material?.map).toBeInstanceOf(THREE.DataTexture);
    expect(rightCanvas?.material?.map).toBeInstanceOf(THREE.DataTexture);
    expect(leftCanvas.material.map.userData.warRoomCampaignArt).toBe('command');
    expect(rightCanvas.material.map.userData.warRoomCampaignArt).toBe('victory');
    expect(leftCanvas.material.map.userData.source).toBe('approved-war-room-mock');
    expect(rightCanvas.material.map.userData.source).toBe('approved-war-room-mock');
    expect(leftCanvas.material.map.userData.warRoomCampaignTextureCache).toBe('module-clone-v1');
    expect(rightCanvas.material.map.userData.warRoomCampaignTextureCache).toBe('module-clone-v1');
    expect(left.userData.warRoomCampaignGalleryVersion).toBe('approved-mock-v1');
    expect(right.userData.warRoomCampaignGalleryVersion).toBe('approved-mock-v1');
    expect(left.userData.warRoomLandscapeSubject).toBeUndefined();
    expect(right.userData.warRoomLandscapeSubject).toBeUndefined();
    expect(owner.userData.warRoomMilitaryGalleryCentralCanvases).toBe(2);
    expect(owner.userData.warRoomCampaignTextureCache).toBe('module-prototype-v1');

    // UserPolish still owns some legacy static work in the shared first-paint
    // queue. The military gallery must run after it so the old landscapes can
    // never become the visible final frame.
    expect(typeof leftCanvas.onBeforeRender).toBe('function');
    leftCanvas.onBeforeRender();
    expect(leftCanvas.material.map.userData.warRoomCampaignArt).toBe('command');
    expect(rightCanvas.material.map.userData.warRoomCampaignArt).toBe('victory');
    expect(owner.userData.warRoomMilitaryGalleryFinalized).toBe('approved-mock-v1');

    dispose(room);
  });

  it('monta un lienzo militar discreto en cada pared lateral', () => {
    const room = buildPremiumWarRoomLayer(theme, true, false);
    const owner = galleryOwner(room);
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
    expect(owner.userData.warRoomMilitaryGallerySideCanvases).toBe(2);

    dispose(room);
  });

  it('implementa el mock premium como aplique gótico con brasero, no como pilum', () => {
    const room = buildPremiumWarRoomLayer(theme, true, false);
    const owner = galleryOwner(room);

    for (const side of ['left', 'right']) {
      const torch = room.getObjectByName(`war-room-side-torch-${side}`);
      const flame = torch?.getObjectByName('war-room-side-torch-flame-outer');
      const inner = torch?.getObjectByName('war-room-side-torch-flame-inner');
      const light = torch?.getObjectByName('war-room-side-torch-light');
      const painting = room.getObjectByName(`war-room-campaign-painting-${side}`);

      expect(torch).toBeInstanceOf(THREE.Group);
      expect(torch.userData.warRoomTorchArt).toBe('approved-premium-mock-v2');
      expect(torch.userData.warRoomTorchForm).toBe('gothic-wall-sconce-brazier');
      expect(torch.getObjectByName('war-room-side-torch-backplate')).toBeInstanceOf(THREE.Mesh);
      expect(torch.getObjectByName('war-room-side-torch-wall-arm')).toBeInstanceOf(THREE.Mesh);
      expect(torch.getObjectByName('war-room-side-torch-brazier-bowl')).toBeInstanceOf(THREE.Mesh);
      expect(torch.getObjectByName('war-room-side-torch-brazier-rim')).toBeInstanceOf(THREE.Mesh);
      expect(torch.getObjectByName('war-room-side-torch-embers')).toBeInstanceOf(THREE.Mesh);
      expect(torch.getObjectByName('war-room-side-torch-cage-bar')).toBeInstanceOf(THREE.Mesh);
      expect(torch.getObjectByName('war-room-side-torch-crown-spike')).toBeInstanceOf(THREE.Mesh);
      expect(flame).toBeInstanceOf(THREE.Mesh);
      expect(inner).toBeInstanceOf(THREE.Mesh);
      expect(flame.geometry).toBeInstanceOf(THREE.LatheGeometry);
      expect(flame.userData.warRoomAnimatedTorch).toBe(true);
      expect(typeof flame.onBeforeRender).toBe('function');
      expect(light).toBeInstanceOf(THREE.PointLight);
      expect(light.color.getHex()).toBe(0xff8738);
      expect(light.castShadow).toBe(false);
      expect(() => flame.onBeforeRender()).not.toThrow();

      expect(torch.userData.warRoomOffsetFromWall - painting.userData.warRoomOffsetFromWall).toBeGreaterThanOrEqual(2);
    }
    expect(owner.userData.warRoomMilitaryGalleryTorches).toBe(2);
    expect(owner.userData.warRoomTorchArt).toBe('approved-premium-mock-v2');

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
