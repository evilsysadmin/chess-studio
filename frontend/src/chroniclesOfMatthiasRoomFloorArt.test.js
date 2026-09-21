import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CHRONICLES_TACTICS_ROOM_FLOOR_VERSION,
  chroniclesTacticsRoomFloorPlan,
  installChroniclesTacticsRoomFloorArt,
} from './chroniclesOfMatthiasRoomFloorArt.js';

function fixture(dressing) {
  return {
    center: { x: 3, y: 3 },
    sceneStyle: {
      dressing,
      palette: {
        wallTrim: 0x211d19,
        metal: 0x8b7445,
      },
    },
    wallFaces: [
      { x: 0, y: 2, side: 'east' },
      { x: 0, y: 3, side: 'east' },
      { x: 0, y: 4, side: 'east' },
      { x: 2, y: 0, side: 'south' },
      { x: 3, y: 0, side: 'south' },
      { x: 4, y: 0, side: 'south' },
      { x: 6, y: 2, side: 'west' },
      { x: 6, y: 3, side: 'west' },
    ],
  };
}

describe('Chronicles Tactics room floor detail', () => {
  it('frames every exposed walkable wall edge without inventing tactical cells', () => {
    const plan = chroniclesTacticsRoomFloorPlan(fixture('gallery-forked-v3'));

    expect(plan.version).toBe(CHRONICLES_TACTICS_ROOM_FLOOR_VERSION);
    expect(plan.edges).toHaveLength(8);
    expect(plan.features).toHaveLength(4);
    expect(plan.featureKind).toBe('gallery-fork-inlay');
    expect(plan.edges.every((entry) => (
      Number.isFinite(entry.x)
      && Number.isFinite(entry.z)
      && Number.isFinite(entry.nx)
      && Number.isFinite(entry.nz)
    ))).toBe(true);
  });

  it('keeps Menagerie floor language distinct from Gallery heraldry', () => {
    const menagerie = chroniclesTacticsRoomFloorPlan(fixture('menagerie-ash-v3'));
    const gallery = chroniclesTacticsRoomFloorPlan(fixture('gallery-forked-v3'));

    expect(menagerie.featureKind).toBe('menagerie-ash-grate');
    expect(gallery.featureKind).toBe('gallery-fork-inlay');
    expect(menagerie.features).toHaveLength(4);
    expect(gallery.features).toHaveLength(4);
  });

  it('installs one batched curb layer plus low room-specific detail', () => {
    const scene = new THREE.Scene();
    const first = installChroniclesTacticsRoomFloorArt(scene, {
      coarsePointer: false,
      scenePlan: fixture('menagerie-ash-v3'),
    });
    const second = installChroniclesTacticsRoomFloorArt(scene, {
      coarsePointer: false,
      scenePlan: fixture('menagerie-ash-v3'),
    });

    expect(second).toBe(first);
    expect(first.userData.chroniclesRoomFloorStyle).toBe('menagerie-ash-v3');
    expect(first.userData.chroniclesRoomFloorEdgeCount).toBe(8);
    expect(first.userData.chroniclesRoomFloorFeatureCount).toBe(4);
    expect(first.getObjectByName('chronicles-room-floor-curb-instances')?.count).toBe(8);
    expect(first.getObjectByName('chronicles-room-menagerie-floor-grate-0')).toBeTruthy();
  });
});
