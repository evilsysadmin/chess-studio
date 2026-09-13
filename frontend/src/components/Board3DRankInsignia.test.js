import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  BOARD3D_RANK_INSIGNIA_NAME,
  board3DRankInsigniaPlan,
  buildBoard3DRankInsignia,
  syncBoard3DRankInsignias,
} from './Board3DRankInsignia.js';

describe('Board3D Combat rank insignia', () => {
  it('keeps recruits visually clean and maps every veteran threshold to the existing rank language', () => {
    expect(board3DRankInsigniaPlan(1)).toBeNull();
    expect([2, 3, 4, 5, 6, 8, 10, 12].map((level) => board3DRankInsigniaPlan(level)?.rankId)).toEqual([
      'soldier', 'corporal', 'sergeant', 'lieutenant', 'captain', 'commander', 'colonel', 'general',
    ]);
  });

  it('builds a raised physical mark on the camera-facing side of the plinth', () => {
    const front = buildBoard3DRankInsignia(4, { faceTowardCamera: true });
    const rear = buildBoard3DRankInsignia(4, { faceTowardCamera: false, coarsePointer: true });

    expect(front).toBeInstanceOf(THREE.Mesh);
    expect(front.name).toBe(BOARD3D_RANK_INSIGNIA_NAME);
    expect(front.userData).toMatchObject({
      rankId: 'sergeant',
      board3DRankInsignia: true,
      diegeticFinish: 'raised-brass-plinth-v1',
      rankFront: 1,
    });
    expect(front.position.z).toBeGreaterThan(0);
    expect(rear.position.z).toBeLessThan(0);
    expect(rear.userData.rankFront).toBe(-1);
  });

  it('syncs by occupied square, reuses unchanged galones and removes them for recruits', () => {
    const piece = new THREE.Group();
    const pieceMeshes = new Map([['e2', piece]]);

    expect(syncBoard3DRankInsignias(pieceMeshes, { pieceLevels: { e2: 6 } })).toBe(1);
    const first = piece.getObjectByName(BOARD3D_RANK_INSIGNIA_NAME);
    expect(first.userData.rankId).toBe('captain');

    expect(syncBoard3DRankInsignias(pieceMeshes, { pieceRankLevels: { e2: 6 } })).toBe(1);
    expect(piece.getObjectByName(BOARD3D_RANK_INSIGNIA_NAME)).toBe(first);

    expect(syncBoard3DRankInsignias(pieceMeshes, { pieceLevels: { e2: 1 } })).toBe(0);
    expect(piece.getObjectByName(BOARD3D_RANK_INSIGNIA_NAME)).toBeUndefined();
    expect(piece.userData.board3DRankId).toBeUndefined();
  });
});
