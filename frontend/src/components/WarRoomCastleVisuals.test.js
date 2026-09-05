import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildPremiumTableLayer, buildPremiumWarRoomLayer } from './PremiumWarRoomScene.js';

const theme = {
  felt: 0x173943,
  glow: 0xc5963f,
};

describe('War Room castle visual contract', () => {
  it('saca el atrezzo del tablero y omite las antiguas consolas desktop ya retiradas', () => {
    const scene = new THREE.Scene();
    const room = buildPremiumWarRoomLayer(theme, true, false);
    const table = buildPremiumTableLayer(theme, false);
    const architecture = room.getObjectByName('war-room-castle-architecture');
    scene.add(room);
    scene.add(table);

    expect(room.getObjectByName('war-room-side-console-left')).toBeUndefined();
    expect(room.getObjectByName('war-room-side-console-right')).toBeUndefined();
    expect(room.getObjectByName('war-room-console-field-folio')).toBeUndefined();
    expect(room.getObjectByName('war-room-console-command-chronometer')).toBeUndefined();
    expect(room.getObjectByName('war-room-console-matthias-relic')).toBeUndefined();
    expect(room.getObjectByName('war-room-console-map-pencil')).toBeUndefined();
    expect(architecture.userData.warRoomDesktopRetiredSideConsoleMeshesOmitted).toBe(30);

    const driver = room.getObjectByName('war-room-castle-floor-slab');
    expect(driver?.userData?.warRoomCastleSceneDriver).toBe(true);
    expect(typeof driver?.onBeforeRender).toBe('function');
    driver.onBeforeRender();

    for (const name of [
      'war-table-field-folio',
      'war-table-map-pencil',
      'war-table-command-chronometer',
      'matthias-command-relic',
    ]) {
      const oldProp = table.getObjectByName(name);
      expect(oldProp).toBeTruthy();
      expect(oldProp.visible).toBe(false);
      expect(oldProp.userData.relocatedToRoomDecor).toBe(true);
    }
  });

  it('mantiene un fuego animado y cálido y finaliza el acabado premium también en el perfil ligero', () => {
    const scene = new THREE.Scene();
    const room = buildPremiumWarRoomLayer(theme, true, true);
    scene.add(room);

    const driver = room.getObjectByName('war-room-castle-floor-slab');
    const premiumFinalizer = room.getObjectByName('war-room-castle-wall-left');
    const fireCore = room.getObjectByName('war-room-fire-core');
    const fireLight = room.getObjectByName('war-room-fire-light');
    expect(driver).toBeTruthy();
    expect(premiumFinalizer?.userData?.warRoomPremiumRoomDriver).toBeUndefined();
    expect(premiumFinalizer?.userData?.warRoomDeferredFinalizer).toBe('deferred-finalizer-v1');
    expect(typeof premiumFinalizer?.onBeforeRender).toBe('function');
    expect(fireCore).toBeTruthy();
    expect(fireLight).toBeTruthy();

    premiumFinalizer.onBeforeRender();
    const flame = fireCore.children.find((child) => child?.isMesh);
    const before = flame.scale.y;
    driver.onBeforeRender();

    expect(scene.userData.warRoomPremiumCoherence).toBe('v5-mobile-foreground');
    expect(scene.userData.warRoomDeferredFinalizedTasks).toContain('premium-room-pass-v4');
    expect(scene.userData.warRoomDeferredFinalizerResults['premium-room-pass-v4']).toBe(1);
    expect(fireCore.userData.warRoomWarmFireAnimated).toBe(true);
    expect(room.getObjectByName('war-room-fire-bounce-light')).toBeTruthy();
    expect(fireLight.intensity).toBeGreaterThan(0);
    expect(fireLight.color.r).toBeGreaterThan(fireLight.color.b);
    expect(flame.material.emissiveIntensity).toBeGreaterThan(0);
    expect(Number.isFinite(flame.scale.y)).toBe(true);
    expect(before).toBeGreaterThan(0);
  });

  it('aplica el mock v28: una mesa central, armaduras de guardia, sofás separados y galería militar', () => {
    const scene = new THREE.Scene();
    const room = buildPremiumWarRoomLayer(theme, true, false);
    scene.add(room);

    const formerPremiumDriver = room.getObjectByName('war-room-castle-wall-left');
    const finalizerDriver = room.getObjectByName('war-room-premium-painting-canvas');
    const architecture = room.getObjectByName('war-room-castle-architecture');
    expect(formerPremiumDriver?.userData?.warRoomPremiumRoomDriver).toBeUndefined();
    expect(finalizerDriver?.userData?.warRoomDeferredFinalizer).toBe('deferred-finalizer-v1');
    expect(typeof finalizerDriver?.onBeforeRender).toBe('function');
    expect(architecture?.userData?.warRoomDesktopLegacyLayoutDriverRetired).toBe(true);
    finalizerDriver.onBeforeRender();

    expect(scene.userData.warRoomDeferredFinalizedTasks[0]).toBe('premium-room-pass-v4');
    expect(scene.userData.warRoomDeferredFinalizerResults['premium-room-pass-v4']).toBe(1);
    const leftSofa = room.getObjectByName('war-room-sofa-left');
    const desk = room.getObjectByName('command-cabinet');
    const chair = room.getObjectByName('war-room-teutonic-command-chair');
    const leftArmor = room.getObjectByName('war-room-teutonic-armor-left');

    expect(leftSofa.userData.warRoomPremiumUpholstery).toBe('teutonic-carved-burgundy-v28');
    expect(leftSofa.getObjectByName('war-room-teutonic-sofa-art-v28')).toBeTruthy();
    expect(room.getObjectByName('war-room-side-console-left')).toBeUndefined();
    expect(room.getObjectByName('war-room-side-console-right')).toBeUndefined();
    expect(architecture.userData.warRoomDesktopRetiredSideConsoleMeshesOmitted).toBe(30);
    expect(architecture.userData.warRoomDesktopRetiredArmorMeshesOmitted).toBe(44);
    expect(architecture.userData.warRoomDesktopRetiredLegacyMeshesOmitted).toBe(74);
    expect(desk.visible).toBe(true);
    expect(desk.position.x).toBe(0);
    expect(desk.userData.warRoomOffsetFromWall).toBeCloseTo(1.45, 5);
    expect(desk.getObjectByName('war-room-teutonic-command-desk-v28')).toBeTruthy();
    expect(chair).toBeTruthy();
    expect(chair.userData.warRoomOffsetFromWall).toBeCloseTo(0.55, 5);
    expect(chair.userData.facesWarTable).toBe(true);
    expect(leftArmor.userData.warRoomOffsetFromWall).toBeCloseTo(6.95, 5);
    expect(leftArmor.userData.warRoomArmorLegProfile).toBe('heavy-gothic-v28');
    expect(leftSofa.userData.warRoomOffsetFromWall).toBeCloseTo(12.55, 5);
    expect(Math.abs(leftSofa.userData.warRoomOffsetFromWall - leftArmor.userData.warRoomOffsetFromWall)).toBeCloseTo(5.6, 5);
    expect(scene.userData.warRoomApprovedMockDeskOffset).toBeCloseTo(1.45, 5);
    expect(scene.userData.warRoomApprovedMockChairOffset).toBeCloseTo(0.55, 5);
    expect(scene.userData.warRoomApprovedMockArmorOffset).toBeCloseTo(6.95, 5);
    expect(scene.userData.warRoomApprovedMockSofaOffset).toBeCloseTo(12.55, 5);
    expect(scene.userData.warRoomApprovedMockArmorSofaGap).toBeCloseTo(5.6, 5);
    expect(scene.userData.warRoomApprovedMockSideTablesRetired).toBe(true);
    expect(scene.userData.warRoomApprovedMockFurnitureOrder).toBe('single-desk-rear-armors-mid-sofas-foreground-v28');
    expect(scene.userData.warRoomLegacyLayoutDriverRetirementVersion).toBe('approved-mock-v28');
    expect(scene.userData.warRoomLegacyLayoutDriversRetired).toEqual([]);
    expect(Math.abs(leftArmor.position.x)).toBeGreaterThan(7);
    expect(Math.abs(leftArmor.rotation.y)).toBeGreaterThan(1.3);
    expect(room.getObjectByName('war-room-sofa-carved-top-rail')).toBeTruthy();
    expect(room.getObjectByName('war-room-command-chair-crown-rail')).toBeTruthy();
    expect(room.getObjectByName('war-room-armor-alcove-left')).toBeUndefined();
    expect(room.getObjectByName('war-room-hammerbeam-side-tie')).toBeUndefined();

    const fireCore = room.getObjectByName('war-room-fire-core');
    const flame = fireCore.children.find((child) => child?.isMesh);
    expect(fireCore.userData.warRoomPremiumFire).toBe('lathed-licks-v2');
    expect(flame.userData.warRoomPremiumFlame).toBe(true);
    expect(flame.geometry.type).toBe('LatheGeometry');
    expect(flame.material.blending).toBe(THREE.AdditiveBlending);

    const canvas = finalizerDriver;
    expect(canvas.material.map).toBeInstanceOf(THREE.DataTexture);
    expect(canvas.material.map.userData.warRoomCampaignArt).toBe('command');
    expect(canvas.material.map.userData.source).toBe('approved-war-room-mock');
    expect(canvas.material.map.userData.resolution).toEqual([64, 48]);
    expect(architecture.userData.warRoomMilitaryGalleryCentralCanvases).toBe(2);
    expect(architecture.userData.warRoomMilitaryGallerySideCanvases).toBe(2);
    expect(architecture.userData.warRoomMilitaryGalleryTorches).toBe(2);
    expect(room.getObjectByName('war-room-campaign-painting-left')).toBeTruthy();
    expect(room.getObjectByName('war-room-campaign-painting-right')).toBeTruthy();
    expect(room.getObjectByName('war-room-side-torch-left')).toBeTruthy();
    expect(room.getObjectByName('war-room-side-torch-right')).toBeTruthy();
    expect(scene.userData.warRoomPremiumCoherence).toBe('v4-gothic');
  });

  it('flanquea la sala con armaduras góticas de acabado museo sin construir la primera versión de hojalata', () => {
    const scene = new THREE.Scene();
    const room = buildPremiumWarRoomLayer(theme, true, false);
    scene.add(room);
    const architecture = room.getObjectByName('war-room-castle-architecture');
    const left = room.getObjectByName('war-room-teutonic-armor-left');
    const right = room.getObjectByName('war-room-teutonic-armor-right');
    const breast = left?.getObjectByName('war-room-armor-breastplate');
    const sword = left?.getObjectByName('war-room-zweihander');
    const finalizerDriver = room.getObjectByName('war-room-premium-painting-canvas');

    expect(left).toBeTruthy();
    expect(right).toBeTruthy();
    expect(left.userData.warRoomArmorScale).toBe('human');
    expect(left.userData.warRoomArmorStyle).toBe('german-gothic-plate');
    expect(left.userData.warRoomArmorFinish).toBe('museum-gothic-steel-v3');
    expect(left.userData.warRoomMuseumFinish).toBe('v3');
    expect(left.userData.warRoomArmorDetail).toBe('etched-riveted-articulated-v3');
    expect(left.getObjectByName('war-room-armor-sallet-visor')).toBeTruthy();
    expect(left.getObjectByName('war-room-armor-breast-flute')).toBeTruthy();
    expect(left.getObjectByName('war-room-armor-tasset')).toBeTruthy();
    expect(left.getObjectByName('war-room-armor-heraldic-medallion')).toBeTruthy();
    expect(left.getObjectByName('war-room-armor-breast-etched-band')).toBeTruthy();
    expect(left.getObjectByName('war-room-armor-gauntlet-finger-plate')).toBeTruthy();
    expect(breast?.material?.bumpMap?.userData?.warRoomPremiumSurface).toBe('steel');
    expect(breast?.material?.userData?.warRoomPremiumArmorFinish).toBe('brushed-patina-metal-v3');
    expect(sword?.userData?.warRoomSwordType).toBe('two-handed');
    expect(sword?.userData?.warRoomSwordFinish).toBe('fullered-ceremonial-v2');
    expect(sword?.getObjectByName('war-room-zweihander-fuller')).toBeTruthy();
    expect(sword?.getObjectByName('war-room-zweihander-parrying-hooks')).toBeTruthy();
    expect(sword?.getObjectByName('war-room-zweihander-polished-edge-left')).toBeTruthy();
    expect(sword?.getObjectByName('war-room-zweihander-pommel-ring')).toBeTruthy();

    expect(room.getObjectByName('war-room-armor-guard-left')).toBeUndefined();
    expect(room.getObjectByName('war-room-armor-guard-right')).toBeUndefined();
    expect(architecture.userData.warRoomDesktopRetiredArmorMeshesOmitted).toBe(44);
    expect(finalizerDriver?.userData?.warRoomLegacyArmorRetirementDriver).toBeUndefined();
    expect(typeof finalizerDriver?.onBeforeRender).toBe('function');
    finalizerDriver.onBeforeRender();
    expect(scene.userData.warRoomLegacyArmorRetired).toBe(true);
    expect(scene.userData.warRoomDeferredFinalizedTasks).toContain('legacy-armor-retirement-v1');
    expect(scene.userData.warRoomDeferredFinalizerResults['legacy-armor-retirement-v1']).toBe(0);
  });
});
