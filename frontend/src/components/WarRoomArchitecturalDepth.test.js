import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { installWarRoomArchitecturalDepth } from './WarRoomArchitecturalDepth.js';
import { addPremiumWarRoomPaintings } from './WarRoomPremiumPaintings.js';

function meshCount(root) {
  let count = 0;
  root.traverse((object) => {
    if (object.isMesh) count += 1;
  });
  return count;
}

function namedCount(root, name) {
  let count = 0;
  root.traverse((object) => {
    if (object.name === name) count += 1;
  });
  return count;
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
    for (const material of list) {
      if (!material || materials.has(material)) continue;
      materials.add(material);
      material.dispose?.();
    }
  });
}

describe('War Room architectural depth', () => {
  it('grounds the desktop room with a bounded castle/gallery pass', () => {
    const group = new THREE.Group();
    const added = installWarRoomArchitecturalDepth(group, {
      wallZ: -7.6,
      towardBoard: 1,
      coarsePointer: false,
    });

    expect(added).toBe(24);
    expect(group.userData.warRoomArchitecturalDepth).toBe('v5-grounded-gallery');
    expect(group.userData.warRoomArchitecturalDepthMeshBudget).toBe(24);
    expect(meshCount(group)).toBe(24);

    const carpet = group.getObjectByName('war-room-command-carpet');
    expect(carpet).toBeInstanceOf(THREE.Group);
    expect(carpet.userData.warRoomCarpetFinish).toBe('oxblood-wool-brass-key-v1');
    expect(carpet.getObjectByName('war-room-command-carpet-bed')).toBeTruthy();
    expect(namedCount(carpet, 'war-room-command-carpet-brass-key')).toBe(4);

    for (const side of ['left', 'right']) {
      const alcove = group.getObjectByName(`war-room-armor-alcove-${side}`);
      expect(alcove).toBeInstanceOf(THREE.Group);
      expect(alcove.userData.warRoomArmorBackdrop).toBe(true);
      expect(alcove.getObjectByName('war-room-armor-alcove-recess')).toBeTruthy();
      expect(namedCount(alcove, 'war-room-armor-alcove-jamb')).toBe(2);
      expect(namedCount(alcove, 'war-room-armor-alcove-pointed-arch')).toBe(2);
      expect(alcove.getObjectByName('war-room-armor-alcove-plinth')).toBeTruthy();
    }

    expect(namedCount(group, 'war-room-continuous-stone-skirting')).toBe(2);
    expect(namedCount(group, 'war-room-gallery-picture-rail')).toBe(2);
    expect(namedCount(group, 'war-room-gallery-picture-rail-brass-line')).toBe(2);
    expect(namedCount(group, 'war-room-museum-side-key-left')).toBe(0);

    // Idempotent: repeated render/setup paths cannot keep growing the room.
    expect(installWarRoomArchitecturalDepth(group, {
      wallZ: -7.6,
      towardBoard: 1,
      coarsePointer: false,
    })).toBe(0);
    expect(meshCount(group)).toBe(24);

    dispose(group);
  });

  it('keeps the extra architecture completely off coarse/mobile profiles', () => {
    const group = new THREE.Group();
    expect(installWarRoomArchitecturalDepth(group, {
      wallZ: -7.6,
      towardBoard: 1,
      coarsePointer: true,
    })).toBe(0);
    expect(group.children).toHaveLength(0);
    expect(group.userData.warRoomArchitecturalDepth).toBeUndefined();
  });

  it('is installed by the existing desktop museum/gallery pass', () => {
    const group = new THREE.Group();
    const count = addPremiumWarRoomPaintings(group, {
      wallZ: -7.6,
      towardBoard: 1,
      coarsePointer: false,
    });

    expect(count).toBe(2);
    expect(group.getObjectByName('war-room-architectural-depth')).toBeTruthy();
    expect(group.getObjectByName('war-room-command-carpet')).toBeTruthy();
    expect(group.getObjectByName('war-room-armor-alcove-left')).toBeTruthy();
    expect(group.getObjectByName('war-room-armor-alcove-right')).toBeTruthy();
    expect(group.userData.warRoomArchitecturalDepthMeshBudget).toBe(24);
    expect(group.userData.warRoomPracticalLightCount).toBe(2);

    dispose(group);
  });
});
