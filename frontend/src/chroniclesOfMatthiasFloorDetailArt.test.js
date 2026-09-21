import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CHRONICLES_TACTICS_FLOOR_DETAIL_STYLE,
  chroniclesTacticsFloorDetailCells,
  installChroniclesTacticsFloorDetail,
} from './chroniclesOfMatthiasFloorDetailArt.js';

const scenePlan = Object.freeze({
  mapId: 'menagerie-of-ash',
  center: { x: 1, y: 1 },
  floors: Object.freeze([
    { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 },
    { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 },
    { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 },
  ]),
});

describe('Chronicles Tactics floor detail', () => {
  it('selects a deterministic subset of walkable slabs', () => {
    const first = chroniclesTacticsFloorDetailCells(scenePlan, { coarsePointer: false });
    const second = chroniclesTacticsFloorDetailCells(scenePlan, { coarsePointer: false });
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(0);
    expect(first.length).toBeLessThan(scenePlan.floors.length);
  });

  it('batches floor cracks in one instanced draw group', () => {
    const scene = new THREE.Scene();
    const root = installChroniclesTacticsFloorDetail(scene, { scenePlan, coarsePointer: false });
    const mesh = root.getObjectByName('chronicles-tactics-floor-crack-instances');
    expect(root.userData.chroniclesFloorDetailProfile).toBe(CHRONICLES_TACTICS_FLOOR_DETAIL_STYLE.profile);
    expect(mesh?.isInstancedMesh).toBe(true);
    expect(mesh.count).toBe(root.userData.chroniclesFloorDetailCount);
  });

  it('is idempotent', () => {
    const scene = new THREE.Scene();
    const first = installChroniclesTacticsFloorDetail(scene, { scenePlan });
    const second = installChroniclesTacticsFloorDetail(scene, { scenePlan });
    expect(second).toBe(first);
  });
});
