import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildPiece, disposeObject } from './Board3DPieces.js';

function rookParts(root, name) {
  const matches = [];
  root.traverse((child) => {
    if (child?.isMesh && child.userData?.rookPart === name) matches.push(child);
  });
  return matches;
}

function worldHeight(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  return box.max.y - box.min.y;
}

describe('Board3D premium rook silhouette', () => {
  it('reproduce el mock con fuste cóncavo, cinturón ornamental y seis almenas anchas', () => {
    const rook = buildPiece('r', 'w', 'studio', false);
    const pawn = buildPiece('p', 'w', 'studio', false);
    const bishop = buildPiece('b', 'w', 'studio', false);

    expect(rook.userData.warRoomFallbackPiece).not.toBe(true);
    expect(rook.userData.board3DRookSilhouetteVersion).toBe('premium-castle-v1');
    expect(rook.userData.board3DRookBodyProfile).toBe('concave-staunton-v1');
    expect(rook.userData.board3DRookCrownProfile).toBe('six-wide-crenellations-v1');
    expect(rook.userData.board3DRookLuxuryBandProfile).toBe('fluted-band-16-v1');
    expect(rookParts(rook, 'body')).toHaveLength(1);
    expect(rookParts(rook, 'ornamental-band')).toHaveLength(1);
    expect(rookParts(rook, 'band-flute')).toHaveLength(16);
    expect(rookParts(rook, 'crown-base')).toHaveLength(1);
    expect(rookParts(rook, 'battlement')).toHaveLength(6);
    expect(worldHeight(rook)).toBeGreaterThan(worldHeight(pawn) * 1.1);
    expect(worldHeight(rook)).toBeLessThan(worldHeight(bishop));

    [rook, pawn, bishop].forEach(disposeObject);
  });

  it('mantiene la lectura premium en coarse pointer con menos geometría decorativa', () => {
    const rook = buildPiece('r', 'b', 'studio', true);

    expect(rook.userData.warRoomFallbackPiece).not.toBe(true);
    expect(rook.userData.board3DRookSilhouetteVersion).toBe('premium-castle-lite-v1');
    expect(rook.userData.board3DRookLuxuryBandProfile).toBe('fluted-band-8-v1');
    expect(rookParts(rook, 'band-flute')).toHaveLength(8);
    expect(rookParts(rook, 'battlement')).toHaveLength(6);
    expect(rookParts(rook, 'crown-base')[0]?.geometry?.type).toBe('CylinderGeometry');

    disposeObject(rook);
  });
});