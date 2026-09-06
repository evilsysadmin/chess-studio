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
  it('keeps only the five high-value real point lights and leaves decorative lamps emissive-only', () => {
    const scene = new THREE.Scene();
    const names = [
      'war-room-rim-light',
      'war-room-warm-light',
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

    const stats = applyWarRoomPerformanceBudget(scene);

    expect(stats.pointLightsKept).toBe(5);
    expect(stats.pointLightsCulled).toBe(4);
    expect(warRoomDesktopPointLightKeepNames()).toEqual(new Set([
      'war-room-rim-light',
      'war-room-warm-light',
      'war-room-fire-light',
      'war-room-side-torch-light',
    ]));
    for (const light of lights) {
      const keep = ['war-room-rim-light', 'war-room-warm-light', 'war-room-fire-light', 'war-room-side-torch-light'].includes(light.name);
      expect(light.visible).toBe(keep);
      expect(light.userData.warRoomPerformanceLight).toBe(keep ? 'kept-real-light' : 'emissive-only');
    }
    expect(scene.userData.warRoomPointLightsKept).toBe(5);
    expect(scene.userData.warRoomPointLightsCulled).toBe(4);
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
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.castShadow = true;
    scene.add(light, mesh);

    expect(applyWarRoomPerformanceBudget(scene, { coarsePointer: true })).toEqual({
      pointLightsKept: 0,
      pointLightsCulled: 0,
      staticShadowCastersRetired: 0,
    });
    expect(light.visible).toBe(true);
    expect(mesh.castShadow).toBe(true);
  });
});
