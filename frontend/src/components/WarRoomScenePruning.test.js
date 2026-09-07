import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { attachWarRoomCompositionRootDriver } from './WarRoomCompositionRootDriver.js';
import {
  WAR_ROOM_CANONICAL_PRUNE_VERSION,
  pruneWarRoomRetiredSceneObjects,
} from './WarRoomScenePruning.js';

function mesh(geometry = new THREE.BoxGeometry(1, 1, 1), material = new THREE.MeshBasicMaterial()) {
  return new THREE.Mesh(geometry, material);
}

describe('War Room canonical scene pruning', () => {
  it('physically removes known retired scene roots instead of merely hiding them', () => {
    const scene = new THREE.Scene();
    const retiredNames = [
      'war-room-side-console-left',
      'war-room-armor-guard-right',
      'war-room-armor-alcove-left',
      'war-room-gallery-picture-rail',
      'war-room-hammerbeam-corbel',
      'war-room-teutonic-mortar-joint',
      'war-table-field-folio',
    ];

    for (const name of retiredNames) {
      const object = mesh();
      object.name = name;
      scene.add(object);
    }

    const survivor = mesh();
    survivor.name = 'war-room-teutonic-armor-left';
    scene.add(survivor);

    const stats = pruneWarRoomRetiredSceneObjects(scene);

    expect(stats.removedRoots).toBe(retiredNames.length);
    expect(stats.removedNodes).toBe(retiredNames.length);
    for (const name of retiredNames) expect(scene.getObjectByName(name)).toBeUndefined();
    expect(scene.getObjectByName('war-room-teutonic-armor-left')).toBe(survivor);
    expect(scene.userData.warRoomCanonicalPruneVersion).toBe(WAR_ROOM_CANONICAL_PRUNE_VERSION);
  });

  it('honors retirement markers used by the current polish/finalizer chain', () => {
    const scene = new THREE.Scene();
    const markers = [
      ['replacedByGothicArmor', true],
      ['relocatedToRoomDecor', true],
      ['warRoomFurniturePlacement', 'retired-duplicate-side-table-v28'],
      ['warRoomJointRetired', 'flat-ashlar-texture-v10'],
      ['warRoomApprovedMockWall', 'clean-panel-v28'],
      ['warRoomBraceStyle', 'retired-no-monogram-v24'],
      ['warRoomCurtainPelmet', 'retired-v28'],
    ];

    markers.forEach(([key, value], index) => {
      const object = mesh();
      object.name = `retired-by-marker-${index}`;
      object.userData[key] = value;
      scene.add(object);
    });

    const merelyHidden = mesh();
    merelyHidden.name = 'legitimate-hidden-object';
    merelyHidden.visible = false;
    scene.add(merelyHidden);

    const stats = pruneWarRoomRetiredSceneObjects(scene);

    expect(stats.removedRoots).toBe(markers.length);
    expect(scene.getObjectByName('legitimate-hidden-object')).toBe(merelyHidden);
  });

  it('disposes unique retired resources but preserves resources still referenced by live objects', () => {
    const scene = new THREE.Scene();
    const sharedGeometry = new THREE.BoxGeometry(1, 1, 1);
    const sharedMaterial = new THREE.MeshBasicMaterial();
    const sharedGeometryDispose = vi.fn();
    const sharedMaterialDispose = vi.fn();
    sharedGeometry.addEventListener('dispose', sharedGeometryDispose);
    sharedMaterial.addEventListener('dispose', sharedMaterialDispose);

    const live = mesh(sharedGeometry, sharedMaterial);
    live.name = 'live-wall';
    scene.add(live);

    const retired = new THREE.Group();
    retired.name = 'war-room-side-console-left';
    retired.add(mesh(sharedGeometry, sharedMaterial));

    const uniqueGeometry = new THREE.SphereGeometry(0.5, 8, 6);
    const uniqueTexture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    uniqueTexture.needsUpdate = true;
    const uniqueMaterial = new THREE.MeshBasicMaterial({ map: uniqueTexture });
    const uniqueGeometryDispose = vi.fn();
    const uniqueMaterialDispose = vi.fn();
    const uniqueTextureDispose = vi.fn();
    uniqueGeometry.addEventListener('dispose', uniqueGeometryDispose);
    uniqueMaterial.addEventListener('dispose', uniqueMaterialDispose);
    uniqueTexture.addEventListener('dispose', uniqueTextureDispose);
    retired.add(mesh(uniqueGeometry, uniqueMaterial));
    scene.add(retired);

    const stats = pruneWarRoomRetiredSceneObjects(scene);

    expect(stats.disposedGeometries).toBe(1);
    expect(stats.disposedMaterials).toBe(1);
    expect(stats.disposedTextures).toBe(1);
    expect(uniqueGeometryDispose).toHaveBeenCalledTimes(1);
    expect(uniqueMaterialDispose).toHaveBeenCalledTimes(1);
    expect(uniqueTextureDispose).toHaveBeenCalledTimes(1);
    expect(sharedGeometryDispose).not.toHaveBeenCalled();
    expect(sharedMaterialDispose).not.toHaveBeenCalled();
    expect(scene.getObjectByName('live-wall')).toBe(live);
  });

  it('runs after the shared first-paint finalizer through the composition driver', () => {
    const scene = new THREE.Scene();
    const room = new THREE.Group();
    const driver = mesh();
    driver.name = 'war-room-premium-painting-canvas';
    const retired = mesh();
    retired.name = 'war-room-side-console-right';
    room.add(driver, retired);
    scene.add(room);

    expect(attachWarRoomCompositionRootDriver(room, {
      wallZ: -7.6,
      towardBoard: 1,
      coarsePointer: false,
    })).toBe(true);
    expect(driver.userData.warRoomCanonicalPruneDriver).toBe(true);

    driver.onBeforeRender();
    expect(scene.getObjectByName('war-room-side-console-right')).toBe(retired);
    driver.onAfterRender();

    expect(scene.getObjectByName('war-room-side-console-right')).toBeUndefined();
    expect(driver.userData.warRoomCanonicalPruneCompleted).toBe(true);
    expect(driver.userData.warRoomCanonicalPrunedRoots).toBe(1);
    expect(scene.userData.warRoomCanonicalPruneVersion).toBe(WAR_ROOM_CANONICAL_PRUNE_VERSION);
  });

  it('is one-shot and leaves an already canonical scene untouched on repeated calls', () => {
    const scene = new THREE.Scene();
    const retired = mesh();
    retired.name = 'war-room-armor-guard-left';
    scene.add(retired);

    const first = pruneWarRoomRetiredSceneObjects(scene);
    const second = pruneWarRoomRetiredSceneObjects(scene);

    expect(first.removedRoots).toBe(1);
    expect(second).toEqual({
      removedRoots: 0,
      removedNodes: 0,
      disposedGeometries: 0,
      disposedMaterials: 0,
      disposedTextures: 0,
    });
  });
});
