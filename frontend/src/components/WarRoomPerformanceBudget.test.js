import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  applyWarRoomPerformanceBudget,
  warRoomDesktopPointLightKeepNames,
} from './WarRoomPerformanceBudget.js';

function point(name) {
  const light = new THREE.PointLight(0xffffff, 1, 5, 2);
  light.name = name;
  return light;
}

describe('War Room desktop performance budget', () => {
  it('keeps only fire + side torches as real point lights inside premium decor', () => {
    const scene = new THREE.Scene();
    const names = [
      'war-room-fire-light',
      'war-room-side-torch-light',
      'war-room-side-torch-light',
      'war-room-side-torch-wall-glow',
      'war-room-command-desk-strategy-lamp-light',
      'war-room-banker-lamp-light',
      'war-room-candle-light-left',
    ];
    const lights = names.map(point);
    lights.forEach((light) => scene.add(light));
    const museumKey = new THREE.SpotLight(0xffffff, 1);
    museumKey.name = 'war-room-museum-side-key-left';
    scene.add(museumKey);

    const stats = applyWarRoomPerformanceBudget(scene);

    expect(stats.pointLightsKept).toBe(3);
    expect(stats.pointLightsCulled).toBe(4);
    expect(stats.spotLightsCulled).toBe(1);
    expect(warRoomDesktopPointLightKeepNames()).toEqual(new Set([
      'war-room-fire-light',
      'war-room-side-torch-light',
    ]));
    for (const light of lights) {
      const keep = ['war-room-fire-light', 'war-room-side-torch-light'].includes(light.name);
      expect(light.visible).toBe(keep);
      expect(light.userData.warRoomPerformanceLight).toBe(keep ? 'kept-real-light' : 'emissive-only');
    }
    expect(museumKey.visible).toBe(false);
    expect(museumKey.userData.warRoomPerformanceLight).toBe('global-key-covered');
    expect(scene.userData.warRoomPointLightsKept).toBe(3);
    expect(scene.userData.warRoomPointLightsCulled).toBe(4);
    expect(scene.userData.warRoomSpotLightsCulled).toBe(1);
  });

  it('retires static decor from the directional shadow pass but preserves chess-piece casters', () => {
    const scene = new THREE.Scene();
    const decor = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    decor.castShadow = true;
    decor.name = 'war-room-expensive-rivet-zoo';
    scene.add(decor);

    const piece = new THREE.Group();
    piece.userData = { type: 'q', color: 'w', square: 'd4' };
    const pieceBody = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial());
    pieceBody.castShadow = true;
    piece.add(pieceBody);
    scene.add(piece);

    const stats = applyWarRoomPerformanceBudget(scene);

    expect(stats.staticShadowCastersRetired).toBe(1);
    expect(decor.castShadow).toBe(false);
    expect(decor.userData.warRoomStaticShadowCasterRetired).toBe(true);
    expect(pieceBody.castShadow).toBe(true);
  });

  it('does not apply the desktop hard cut to coarse/mobile scenes', () => {
    const scene = new THREE.Scene();
    const light = point('war-room-command-desk-strategy-lamp-light');
    const spot = new THREE.SpotLight(0xffffff, 1);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.castShadow = true;
    scene.add(light, spot, mesh);

    expect(applyWarRoomPerformanceBudget(scene, { coarsePointer: true })).toEqual({
      pointLightsKept: 0,
      pointLightsCulled: 0,
      spotLightsCulled: 0,
      staticShadowCastersRetired: 0,
    });
    expect(light.visible).toBe(true);
    expect(spot.visible).toBe(true);
    expect(mesh.castShadow).toBe(true);
  });
});
