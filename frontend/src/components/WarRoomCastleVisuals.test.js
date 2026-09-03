import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildPremiumTableLayer, buildPremiumWarRoomLayer } from './PremiumWarRoomScene.js';

const theme = {
  felt: 0x173943,
  glow: 0xc5963f,
};

describe('War Room castle visual contract', () => {
  it('saca el atrezzo del tablero y lo lleva a consolas laterales', () => {
    const scene = new THREE.Scene();
    const room = buildPremiumWarRoomLayer(theme, true, false);
    const table = buildPremiumTableLayer(theme, false);
    scene.add(room);
    scene.add(table);

    expect(room.getObjectByName('war-room-side-console-left')).toBeTruthy();
    expect(room.getObjectByName('war-room-side-console-right')).toBeTruthy();
    expect(room.getObjectByName('war-room-console-field-folio')).toBeTruthy();
    expect(room.getObjectByName('war-room-console-command-chronometer')).toBeTruthy();
    expect(room.getObjectByName('war-room-console-matthias-relic')).toBeTruthy();
    expect(room.getObjectByName('war-room-console-map-pencil')).toBeTruthy();

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

    expect(scene.userData.warRoomPremiumCoherence).toBe('v4-gothic');
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

  it('separa de verdad mesas, armaduras y sofás y mantiene el fuego premium', () => {
    const scene = new THREE.Scene();
    const room = buildPremiumWarRoomLayer(theme, true, false);
    scene.add(room);

    const formerPremiumDriver = room.getObjectByName('war-room-castle-wall-left');
    const finalizerDriver = room.getObjectByName('war-room-premium-painting-canvas');
    expect(formerPremiumDriver?.userData?.warRoomPremiumRoomDriver).toBeUndefined();
    expect(finalizerDriver?.userData?.warRoomDeferredFinalizer).toBe('deferred-finalizer-v1');
    expect(typeof finalizerDriver?.onBeforeRender).toBe('function');
    finalizerDriver.onBeforeRender();

    expect(scene.userData.warRoomDeferredFinalizedTasks[0]).toBe('premium-room-pass-v4');
    expect(scene.userData.warRoomDeferredFinalizerResults['premium-room-pass-v4']).toBe(1);
    const leftSofa = room.getObjectByName('war-room-sofa-left');
    const leftConsole = room.getObjectByName('war-room-side-console-left');
    const leftArmor = room.getObjectByName('war-room-teutonic-armor-left');
    expect(leftSofa.userData.warRoomPremiumUpholstery).toBe('club-tufted-v2');
    expect(leftConsole.userData.warRoomPremiumConsole).toBe('campaign-table-v2');
    expect(leftConsole.userData.warRoomOffsetFromWall).toBeCloseTo(3.3, 5);
    expect(leftArmor.userData.warRoomOffsetFromWall).toBeCloseTo(8.35, 5);
    expect(leftSofa.userData.warRoomOffsetFromWall).toBeCloseTo(12.35, 5);
    expect(Math.abs(leftSofa.userData.warRoomOffsetFromWall - leftConsole.userData.warRoomOffsetFromWall)).toBeCloseTo(9.05, 5);
    expect(Math.abs(leftSofa.userData.warRoomOffsetFromWall - leftArmor.userData.warRoomOffsetFromWall)).toBeCloseTo(4.0, 5);
    expect(scene.userData.warRoomApprovedMockTableOffset).toBeCloseTo(3.3, 5);
    expect(scene.userData.warRoomApprovedMockArmorOffset).toBeCloseTo(8.35, 5);
    expect(scene.userData.warRoomApprovedMockSofaOffset).toBeCloseTo(12.35, 5);
    expect(scene.userData.warRoomApprovedMockFurnitureOrder).toBe('tables-rear-armors-lower-sofas-foreground-v27');
    expect(scene.userData.warRoomLegacyLayoutDriverRetirementVersion).toBe('approved-mock-v27');
    expect(scene.userData.warRoomLegacyLayoutDriversRetired.length).toBeGreaterThanOrEqual(1);
    expect(Math.abs(leftArmor.position.x)).toBeLessThan(Math.abs(leftConsole.position.x));
    expect(room.getObjectByName('war-room-sofa-seat-cushion')).toBeTruthy();
    expect(room.getObjectByName('war-room-console-lower-shelf')).toBeTruthy();
    expect(room.getObjectByName('war-room-armor-alcove-left').visible).toBe(false);
    expect(room.getObjectByName('war-room-hammerbeam-side-tie').visible).toBe(false);

    const fireCore = room.getObjectByName('war-room-fire-core');
    const flame = fireCore.children.find((child) => child?.isMesh);
    expect(fireCore.userData.warRoomPremiumFire).toBe('lathed-licks-v2');
    expect(flame.userData.warRoomPremiumFlame).toBe(true);
    expect(flame.geometry.type).toBe('LatheGeometry');
    expect(flame.material.blending).toBe(THREE.AdditiveBlending);

    const canvas = finalizerDriver;
    expect(canvas.material.map.userData.resolution).toEqual([384, 240]);
    expect(canvas.material.map.userData.warRoomLandscape).toBe('black-forest-lake-dusk-v20');
    expect(canvas.material.map.userData.warRoomGalleryFinish).toBe('layered-canvas-v20');
    expect(scene.userData.warRoomPremiumCoherence).toBe('v4-gothic');
  });

  it('flanquea la sala con armaduras góticas de acabado museo y retira la primera versión de hojalata', () => {
    const scene = new THREE.Scene();
    const room = buildPremiumWarRoomLayer(theme, true, false);
    scene.add(room);
    const left = room.getObjectByName('war-room-teutonic-armor-left');
    const right = room.getObjectByName('war-room-teutonic-armor-right');
    const breast = left?.getObjectByName('war-room-armor-breastplate');
    const sword = left?.getObjectByName('war-room-zweihander');
    const legacyLeft = room.getObjectByName('war-room-armor-guard-left');
    const legacyRight = room.getObjectByName('war-room-armor-guard-right');
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

    expect(legacyLeft).toBeTruthy();
    expect(legacyRight).toBeTruthy();
    expect(finalizerDriver?.userData?.warRoomLegacyArmorRetirementDriver).toBeUndefined();
    expect(typeof finalizerDriver?.onBeforeRender).toBe('function');
    finalizerDriver.onBeforeRender();
    expect(legacyLeft.visible).toBe(false);
    expect(legacyRight.visible).toBe(false);
    expect(legacyLeft.userData.replacedByGothicArmor).toBe(true);
    expect(scene.userData.warRoomLegacyArmorRetired).toBe(true);
    expect(scene.userData.warRoomDeferredFinalizedTasks).toContain('legacy-armor-retirement-v1');
    expect(scene.userData.warRoomDeferredFinalizerResults['legacy-armor-retirement-v1']).toBe(2);
  });
});