import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildPiece, disposeObject } from './Board3DPieces.js';

function bishopPart(root, name) {
  let match = null;
  root.traverse((child) => {
    if (!match && child?.isMesh && child.userData?.bishopPart === name) match = child;
  });
  return match;
}

function worldHeight(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  return box.max.y - box.min.y;
}

function geometrySize(mesh) {
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox;
  return {
    x: box.max.x - box.min.x,
    y: box.max.y - box.min.y,
    z: box.max.z - box.min.z,
  };
}

describe('Board3D bishop silhouette', () => {
  it('se lee como un alfil Staunton alto con mitra y corte diagonal, no como un peón', () => {
    const bishop = buildPiece('b', 'w', 'studio', false);
    const pawn = buildPiece('p', 'w', 'studio', false);
    const mitre = bishopPart(bishop, 'mitre');
    const slash = bishopPart(bishop, 'slash');
    const mitreSize = geometrySize(mitre);

    expect(bishop.userData.warRoomFallbackPiece).not.toBe(true);
    expect(bishop.userData.board3DBishopSilhouetteVersion).toBe('staunton-mitre-v1');
    expect(bishop.userData.board3DBishopHeightProfile).toBe('tall-123-v1');
    expect(bishop.userData.board3DBishopSlashProfile).toBe('wide-diagonal-band-v1');
    expect(mitre?.geometry?.type).toBe('LatheGeometry');
    expect(slash?.geometry?.type).toBe('BoxGeometry');
    expect(slash.rotation.z).toBeCloseTo(0.68, 5);
    expect(mitreSize.y).toBeGreaterThan(mitreSize.x);
    expect(worldHeight(bishop)).toBeGreaterThan(worldHeight(pawn) * 1.2);

    [bishop, pawn].forEach(disposeObject);
  });

  it('conserva las dos señales visuales clave también en coarse pointer', () => {
    const bishop = buildPiece('b', 'b', 'studio', true);
    const mitre = bishopPart(bishop, 'mitre');
    const slash = bishopPart(bishop, 'slash');

    expect(bishop.userData.warRoomFallbackPiece).not.toBe(true);
    expect(bishop.userData.board3DBishopSilhouetteVersion).toBe('staunton-mitre-lite-v1');
    expect(bishop.userData.board3DBishopSlashProfile).toBe('wide-diagonal-band-lite-v1');
    expect(mitre?.geometry?.type).toBe('LatheGeometry');
    expect(slash?.geometry?.type).toBe('BoxGeometry');
    expect(slash.rotation.z).toBeCloseTo(0.68, 5);

    disposeObject(bishop);
  });
});