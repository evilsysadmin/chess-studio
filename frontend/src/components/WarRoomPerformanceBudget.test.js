import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  applyWarRoomPerformanceBudget,
  batchWarRoomStaticDecor,
  warRoomDesktopPointLightKeepNames,
} from './WarRoomPerformanceBudget.js';

function point(name) {
  const light = new THREE.PointLight(0xffffff, 1, 5, 2);
  light.name = name;
  return light;
}

describe('War Room desktop performance budget', () => {
  it('keeps only fire + side torches and detaches retired lights from the scene graph', () => {
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
    const museumTarget = new THREE.Object3D();
    museumTarget.name = 'war-room-museum-side-target-left';
    museumKey.target = museumTarget;
    scene.add(museumTarget, museumKey);

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
      expect(light.userData.warRoomPerformanceLight).toBe(keep ? 'kept-real-light' : 'emissive-only-retired');
      expect(light.parent).toBe(keep ? scene : null);
    }
    expect(museumKey.visible).toBe(false);
    expect(museumKey.userData.warRoomPerformanceLight).toBe('global-key-covered-retired');
    expect(museumKey.parent).toBeNull();
    expect(museumTarget.parent).toBeNull();
    expect(scene.userData.warRoomPointLightsKept).toBe(3);
    expect(scene.userData.warRoomPointLightsCulled).toBe(4);
    expect(scene.userData.warRoomSpotLightsCulled).toBe(1);
    expect(scene.userData.warRoomDetachedLights).toBe(5);
    expect(scene.userData.warRoomDetachedLightTargets).toBe(1);
  });

  it('instances repeated static box families without changing their local transforms', () => {
    const scene = new THREE.Scene();
    const parent = new THREE.Group();
    parent.name = 'war-room-upper-architecture';
    const material = new THREE.MeshStandardMaterial({ color: 0x563b24 });
    const sourcePositions = [-2, 0, 2];

    for (const x of sourcePositions) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.2, 0.25), material);
      beam.name = 'war-room-hammerbeam-transverse';
      beam.position.set(x, 4.5, -1.25);
      beam.receiveShadow = true;
      parent.add(beam);
    }
    scene.add(parent);

    const result = batchWarRoomStaticDecor(scene);
    const batch = parent.getObjectByName('war-room-hammerbeam-transverse');

    expect(result).toEqual({ batches: 1, sourceMeshes: 3, drawCallsRetired: 2 });
    expect(batch?.isInstancedMesh).toBe(true);
    expect(batch.count).toBe(3);
    expect(batch.material).toBe(material);
    expect(batch.userData.warRoomStaticBatch).toBe('instanced-v1');
    expect(batch.userData.warRoomStaticBatchCount).toBe(3);
    expect(parent.children).toHaveLength(1);

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const restoredX = [];
    for (let index = 0; index < batch.count; index += 1) {
      batch.getMatrixAt(index, matrix);
      matrix.decompose(position, quaternion, scale);
      restoredX.push(position.x);
      expect(position.y).toBeCloseTo(4.5);
      expect(position.z).toBeCloseTo(-1.25);
      expect(scale.x).toBeCloseTo(1);
      expect(scale.y).toBeCloseTo(1);
      expect(scale.z).toBeCloseTo(1);
    }
    expect(restoredX).toEqual(sourcePositions);
  });

  it('batches only unnamed box decor inside explicitly safe static parents', () => {
    const scene = new THREE.Scene();
    const walls = new THREE.Group();
    walls.name = 'war-room-castle-side-walls';
    const material = new THREE.MeshStandardMaterial({ color: 0x4b453d });

    for (const z of [1, 3, 5, 7]) {
      const buttress = new THREE.Mesh(new THREE.BoxGeometry(0.18, 4.86, 0.34), material);
      buttress.position.set(7.77, 2.48, z);
      walls.add(buttress);
    }
    const namedWall = new THREE.Mesh(new THREE.BoxGeometry(0.42, 5.75, 13.35), material);
    namedWall.name = 'war-room-castle-wall-left';
    walls.add(namedWall);
    scene.add(walls);

    const result = batchWarRoomStaticDecor(scene);

    expect(result.drawCallsRetired).toBe(3);
    expect(walls.children.filter((child) => child.isInstancedMesh)).toHaveLength(1);
    expect(walls.getObjectByName('war-room-castle-wall-left')).toBe(namedWall);
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
    expect(light.parent).toBe(scene);
    expect(spot.visible).toBe(true);
    expect(spot.parent).toBe(scene);
    expect(mesh.castShadow).toBe(true);
  });
});
