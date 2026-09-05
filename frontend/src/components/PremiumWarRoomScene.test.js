import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildPremiumTableLayer, buildPremiumWarRoomLayer } from './PremiumWarRoomScene.js';

function sceneStats(root) {
  const stats = { meshes: 0, lights: 0, spotLights: 0 };
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) stats.meshes += 1;
    if (object instanceof THREE.Light) stats.lights += 1;
    if (object instanceof THREE.SpotLight) stats.spotLights += 1;
  });
  return stats;
}

function dispose(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse((object) => {
    if (object.geometry && !geometries.has(object.geometry)) {
      geometries.add(object.geometry);
      object.geometry.dispose?.();
    }
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const item of list) {
      if (!item || materials.has(item)) continue;
      materials.add(item);
      item.dispose?.();
    }
  });
}

describe('PremiumWarRoomScene', () => {
  const theme = { felt: 0x173943, glow: 0xc5963f };

  it('construye una sala de guerra teutónica habitable con un solo blasón de peón', () => {
    const desktop = buildPremiumWarRoomLayer(theme, true, false);
    const mobile = buildPremiumWarRoomLayer(theme, true, true);
    const desktopStats = sceneStats(desktop);
    const mobileStats = sceneStats(mobile);
    const crest = desktop.getObjectByName('ceremonial-pawn-crest');

    expect(desktop.name).toBe('premium-war-room-layer');
    expect(desktop.userData.premiumWarRoom).toBe(true);
    expect(desktop.userData.premiumPass).toBe('cinematic-v3-teutonic');
    expect(desktop.userData.warRoomDesktopRetiredCurtainPelmetsOmitted).toBe(2);
    expect(mobile.userData.warRoomDesktopRetiredCurtainPelmetsOmitted).toBeUndefined();
    expect(desktop.getObjectByName('coffered-paneling')).toBeTruthy();
    expect(crest).toBeTruthy();
    expect(crest.userData.singlePawnDisplay).toBe(true);
    expect(desktop.getObjectByName('ceremonial-single-pawn')).toBeTruthy();
    expect(desktop.getObjectByName('command-cabinet')).toBeTruthy();
    expect(desktop.getObjectByName('war-room-sofa-left')).toBeTruthy();
    expect(desktop.getObjectByName('war-room-sofa-right')).toBeTruthy();
    expect(desktop.getObjectByName('war-room-velvet-curtain-fold')).toBeTruthy();
    expect(desktop.getObjectByName('war-room-sconce-flame')).toBeTruthy();
    expect(desktopStats.meshes).toBeGreaterThan(125);
    expect(desktopStats.lights).toBeGreaterThanOrEqual(6);
    expect(desktopStats.spotLights).toBeGreaterThanOrEqual(1);
    expect(desktopStats.meshes).toBeGreaterThan(mobileStats.meshes);

    dispose(desktop);
    dispose(mobile);
  });

  it('usa un fuego multicapa irregular con núcleo, brasas, luz cálida y un ancla renderizable', () => {
    const room = buildPremiumWarRoomLayer(theme, false, false);
    const fire = room.getObjectByName('war-room-fireplace');
    const outerFlame = fire?.getObjectByName('war-room-fire-flame-outer');

    expect(fire).toBeTruthy();
    expect(fire.getObjectByName('war-room-fire-core')).toBeTruthy();
    expect(outerFlame).toBeInstanceOf(THREE.Mesh);
    expect(fire.getObjectByName('war-room-fire-flame-inner')).toBeTruthy();
    expect(fire.getObjectByName('war-room-fire-ember')).toBeTruthy();
    expect(fire.getObjectByName('war-room-fire-light')).toBeInstanceOf(THREE.PointLight);
    expect(fire.getObjectByName('war-room-fire-core').userData.warRoomFireCore).toBe(true);
    expect(outerFlame.userData.warRoomFireAnimationAnchor).toBe(true);
    expect(typeof outerFlame.onBeforeRender).toBe('function');

    dispose(room);
  });

  it('mantiene la mesa premium sin construir el atrezzo retirado en desktop ni mobile', () => {
    const desktop = buildPremiumTableLayer(theme, false);
    const mobile = buildPremiumTableLayer(theme, true);
    const desktopStats = sceneStats(desktop);
    const mobileStats = sceneStats(mobile);
    const retiredNames = [
      'war-table-field-folio',
      'war-table-map-pencil',
      'war-table-command-chronometer',
      'matthias-command-relic',
    ];

    expect(desktop.name).toBe('premium-table-layer');
    expect(desktop.userData.premiumPass).toBe('cinematic-v3-teutonic');
    expect(desktop.userData.warRoomRetiredTableClutterMeshesOmitted).toBe(20);
    expect(mobile.userData.warRoomRetiredTableClutterMeshesOmitted).toBe(13);
    expect(desktop.getObjectByName('emerald-table-inlay')).toBeTruthy();
    expect(mobile.getObjectByName('emerald-table-inlay')).toBeTruthy();
    for (const name of retiredNames) {
      expect(desktop.getObjectByName(name)).toBeUndefined();
      expect(mobile.getObjectByName(name)).toBeUndefined();
    }
    expect(desktopStats.meshes).toBeGreaterThanOrEqual(25);
    expect(mobileStats.meshes).toBeGreaterThanOrEqual(20);
    expect(desktopStats.meshes).toBeGreaterThan(mobileStats.meshes);
    expect(desktopStats.lights).toBe(0);
    expect(mobileStats.lights).toBe(0);

    dispose(desktop);
    dispose(mobile);
  });
});
