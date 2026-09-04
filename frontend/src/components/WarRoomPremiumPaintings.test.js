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
  it('superpone dos lienzos militares con acabado museo, luces prácticas y decorado teutón premium en desktop', () => {
    const group = new THREE.Group();
    const count = addPremiumWarRoomPaintings(group, { wallZ: -7.6, towardBoard: 1, coarsePointer: false });

    expect(count).toBe(2);
    expect(group.userData.warRoomPremiumPaintings).toBe(2);
    expect(group.userData.warRoomPremiumPaintingVersion).toBe('v2');
    expect(group.userData.warRoomPremiumFinishVersion).toBe('museum-gothic-v3');
    expect(group.userData.warRoomPremiumFinishedObjects).toBe(4);
    expect(group.userData.warRoomPracticalLightingVersion).toBe('museum-v4');
    expect(group.userData.warRoomPracticalLightCount).toBe(2);
    expect(group.userData.warRoomPracticalMaterialsTuned).toBeGreaterThan(0);
    expect(group.userData.warRoomTeutonicArmorCount).toBe(2);
    expect(group.userData.warRoomTeutonicStyle).toBe('smoked-rhenish-gothic-v2');
    expect(group.userData.warRoomCompositionPolishVersion).toBe('v10');
    expect(group.userData.warRoomUserPolishVersion).toBe('room-balance-v24');
    expect(group.userData.warRoomApprovedMockVersion).toBe('approved-mock-v28');
    expect(group.userData.warRoomApprovedMockWallStyle).toBe('plain-dark-castle-panel-v28');
    expect(group.userData.warRoomMonogramFree).toBe(true);
    expect(group.userData.warRoomMilitaryGalleryVersion).toBe('approved-mock-v1');
    expect(group.userData.warRoomMilitaryGalleryCentralCanvases).toBe(2);
    expect(group.userData.warRoomMilitaryGallerySideCanvases).toBe(2);
    expect(group.userData.warRoomMilitaryGalleryTorches).toBe(2);
    expect(group.getObjectByName('war-room-teutonic-masonry')).toBeTruthy();

    const leftArmor = group.getObjectByName('war-room-teutonic-armor-left');
    const rightArmor = group.getObjectByName('war-room-teutonic-armor-right');
    expect(leftArmor).toBeTruthy();
    expect(rightArmor).toBeTruthy();
    expect(leftArmor.userData.warRoomPracticalMaterialPass).toBe('v4');
    expect(rightArmor.userData.warRoomPracticalMaterialPass).toBe('v4');
    expect(leftArmor.userData.warRoomArmorPlacement).toBe('approved-mock-wall-sentry-v28');
    expect(rightArmor.userData.warRoomArmorPlacement).toBe('approved-mock-wall-sentry-v28');
    expect(leftArmor.userData.warRoomOffsetFromWall).toBeCloseTo(6.95, 5);
    expect(rightArmor.userData.warRoomOffsetFromWall).toBeCloseTo(6.95, 5);
    expect(Math.abs(leftArmor.position.x)).toBeGreaterThan(7);
    expect(Math.abs(rightArmor.position.x)).toBeGreaterThan(7);
    expect(Math.abs(leftArmor.rotation.y)).toBeGreaterThan(1.3);
    expect(Math.abs(rightArmor.rotation.y)).toBeGreaterThan(1.3);
    expect(leftArmor.userData.warRoomArmorLegProfile).toBe('heavy-gothic-v28');
    expect(rightArmor.userData.warRoomArmorLegProfile).toBe('heavy-gothic-v28');
    expect(leftArmor.userData.facesWarTable).toBe(true);
    expect(rightArmor.userData.facesWarTable).toBe(true);
    expect(group.getObjectByName('war-room-armor-alcove-left').visible).toBe(false);
    expect(group.getObjectByName('war-room-armor-alcove-right').visible).toBe(false);
    expect(group.getObjectByName('war-room-hammerbeam-side-tie').visible).toBe(false);

    for (const armor of [leftArmor, rightArmor]) {
      expect(armor.userData.warRoomArmorPose).toBe('chest-high-zweihander-guard-v28');
      expect(armor.userData.warRoomArmorArtReference).toBe('generated-heavy-sentry-chest-guard-v28');
      const sword = armor.getObjectByName('war-room-zweihander');
      expect(sword).toBeTruthy();
      expect(sword.position.y).toBeCloseTo(0.7, 5);
      expect(sword.userData.warRoomSwordCarry).toBe('chest-high-guard-v28');

      const gauntlets = [];
      armor.traverse((object) => {
        if (object.name === 'war-room-armor-gauntlet') gauntlets.push(object);
      });
      expect(gauntlets).toHaveLength(2);
      const handHeights = gauntlets.map((hand) => hand.position.y);
      expect(Math.min(...handHeights)).toBeGreaterThanOrEqual(1.33);
      expect(Math.max(...handHeights)).toBeGreaterThanOrEqual(1.49);
    }

    const breast = leftArmor.getObjectByName('war-room-armor-breastplate');
    expect(breast.material.userData.warRoomPracticalFinish).toBe('museum-steel-response-v4');
    expect(breast.material.envMapIntensity).toBeGreaterThanOrEqual(1.12);

    for (const side of ['left', 'right']) {
      const light = group.getObjectByName(`war-room-museum-side-key-${side}`);
      expect(light).toBeInstanceOf(THREE.SpotLight);
      expect(light.castShadow).toBe(false);
      expect(light.userData.warRoomPracticalLight).toBe('painting-armor-shared-key-v4');
      expect(group.getObjectByName(`war-room-museum-side-target-${side}`)).toBeTruthy();
    }

    for (const index of [0, 1]) {
      const painting = group.getObjectByName(`war-room-premium-painting-${index}`);
      const canvas = painting?.getObjectByName('war-room-premium-painting-canvas');
      const gilt = painting?.getObjectByName('war-room-premium-frame-gilt-bed');
      const woodBed = painting?.getObjectByName('war-room-premium-frame-wood-bed');
      const lamp = painting?.getObjectByName(`war-room-picture-lamp-${index}`);
      const artKey = index === 0 ? 'command' : 'victory';
      expect(painting).toBeInstanceOf(THREE.Group);
      expect(painting.userData.warRoomPaintingFinish).toBe('museum-canvas-and-gilding-v3');
      expect(painting.userData.warRoomMuseumFinish).toBe('v3');
      expect(painting.userData.warRoomGalleryFinish).toBe('varnished-canvas-v20');
      expect(painting.userData.warRoomPracticalMaterialPass).toBe('v4');
      expect(painting.userData.warRoomCampaignGalleryVersion).toBe('approved-mock-v1');
      expect(painting.userData.warRoomCampaignArt).toBe(artKey);
      expect(painting.userData.warRoomLandscapeVersion).toBeUndefined();
      expect(painting.userData.warRoomLandscapeSubject).toBeUndefined();
      expect(canvas).toBeInstanceOf(THREE.Mesh);
      expect(gilt).toBeInstanceOf(THREE.Mesh);
      expect(woodBed).toBeInstanceOf(THREE.Mesh);
      expect(canvas.material.map).toBeInstanceOf(THREE.DataTexture);
      expect(canvas.material.map.userData.warRoomCampaignArt).toBe(artKey);
      expect(canvas.material.map.userData.source).toBe('approved-war-room-mock');
      expect(canvas.material.map.userData.resolution).toEqual([64, 48]);
      expect(canvas.material.roughness).toBeLessThan(0.7);
      expect(canvas.material.clearcoat).toBeGreaterThanOrEqual(0.14);
      expect(canvas.material.bumpMap?.userData?.warRoomPremiumSurface).toBe('canvas');
      expect(canvas.material.userData.warRoomCanvasFinish).toBe('woven-varnished-linen-v3');
      expect(canvas.material.userData.warRoomPracticalFinish).toBe('museum-canvas-response-v4');
      expect(gilt.material.bumpMap?.userData?.warRoomPremiumSurface).toBe('gilding');
      expect(gilt.material.userData.warRoomFrameFinish).toBe('aged-water-gilding-v3');
      expect(gilt.material.userData.warRoomPracticalFinish).toBe('aged-gilt-response-v4');
      expect(woodBed.material.bumpMap?.userData?.warRoomPremiumSurface).toBe('wood');
      expect(woodBed.material.userData.warRoomFrameFinish).toBe('hand-rubbed-walnut-v3');
      expect(woodBed.material.userData.warRoomPracticalFinish).toBe('dark-wood-response-v4');
      expect(painting.getObjectByName('war-room-premium-frame-gilt-bead')).toBeTruthy();
      expect(painting.getObjectByName('war-room-premium-frame-leaf-ornament')).toBeTruthy();
      expect(painting.getObjectByName('war-room-painting-varnish')).toBeTruthy();
      expect(lamp?.userData?.warRoomPictureLamp).toBe('brass-gallery-lamp-v3');
      expect(painting.getObjectByName(`war-room-picture-plaque-${index}`)).toBeTruthy();
    }

    dispose(group);
  });

  it('no añade geometría ni luces premium extra en coarse pointer/móvil', () => {
    const group = new THREE.Group();
    const count = addPremiumWarRoomPaintings(group, { wallZ: -7.6, towardBoard: 1, coarsePointer: true });
    expect(count).toBe(0);
    expect(group.children).toHaveLength(0);
    expect(group.userData.warRoomPremiumPaintings).toBeUndefined();
    expect(group.userData.warRoomPremiumFinishVersion).toBeUndefined();
    expect(group.userData.warRoomPracticalLightingVersion).toBeUndefined();
    expect(group.userData.warRoomPracticalLightCount).toBeUndefined();
    expect(group.userData.warRoomTeutonicArmorCount).toBeUndefined();
    expect(group.userData.warRoomCompositionPolishVersion).toBeUndefined();
    expect(group.userData.warRoomUserPolishVersion).toBeUndefined();
    expect(group.userData.warRoomApprovedMockVersion).toBeUndefined();
    expect(group.userData.warRoomMilitaryGalleryVersion).toBeUndefined();
    dispose(group);
  });
});
