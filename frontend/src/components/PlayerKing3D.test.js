import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildPiece, disposeObject } from './Board3DPieces.js';

function parts(root, name) {
  const matches = [];
  root.traverse((child) => {
    if (child?.isMesh && child.userData?.playerKingPart === name) matches.push(child);
  });
  return matches;
}

function bounds(root) {
  root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(root);
}

function height(root) {
  const box = bounds(root);
  return box.max.y - box.min.y;
}

function width(root) {
  const box = bounds(root);
  return box.max.x - box.min.x;
}

describe('Board3D player king silhouette', () => {
  it('se lee como un soberano ancho y alto, no como un alfil con cruz', () => {
    const king = buildPiece('k', 'w', 'studio', false);
    const bishop = buildPiece('b', 'w', 'studio', false);
    const pawn = buildPiece('p', 'w', 'studio', false);

    expect(king.userData.warRoomFallbackPiece).not.toBe(true);
    expect(king.userData.board3DPlayerKing).toBe(true);
    expect(king.userData.board3DPlayerKingSilhouetteVersion).toBe('armored-sovereign-v1');
    expect(king.userData.board3DPlayerKingBodyProfile).toBe('broad-shouldered-v1');
    expect(king.userData.board3DPlayerKingCrownProfile).toBe('six-buttress-crown-v1');
    expect(parts(king, 'body')).toHaveLength(1);
    expect(parts(king, 'shoulder-guard')).toHaveLength(4);
    expect(parts(king, 'crown-base')).toHaveLength(1);
    expect(parts(king, 'crown-buttress')).toHaveLength(6);
    expect(parts(king, 'cross-vertical')).toHaveLength(1);
    expect(parts(king, 'cross-horizontal')).toHaveLength(1);
    expect(height(king)).toBeGreaterThan(height(bishop) * 1.12);
    expect(height(king)).toBeGreaterThan(height(pawn) * 1.55);
    expect(width(king)).toBeGreaterThan(width(bishop) * 1.1);

    [king, bishop, pawn].forEach(disposeObject);
  });

  it('mantiene una silueta fuerte en coarse pointer con menos corona decorativa', () => {
    const king = buildPiece('k', 'b', 'studio', true);

    expect(king.userData.warRoomFallbackPiece).not.toBe(true);
    expect(king.userData.board3DPlayerKingSilhouetteVersion).toBe('armored-sovereign-lite-v1');
    expect(king.userData.board3DPlayerKingCrownProfile).toBe('four-buttress-crown-v1');
    expect(parts(king, 'shoulder-guard')).toHaveLength(4);
    expect(parts(king, 'crown-buttress')).toHaveLength(4);
    expect(parts(king, 'cross-horizontal')[0]?.geometry?.type).toBe('BoxGeometry');

    disposeObject(king);
  });

  it('no sustituye el rey-personaje de Matthias', () => {
    const matthias = buildPiece('k', 'w', 'studio', false, { matthiasKing: true });

    expect(matthias.userData.matthiasKing).toBe(true);
    expect(matthias.userData.board3DPlayerKing).not.toBe(true);
    expect(parts(matthias, 'body')).toHaveLength(0);

    disposeObject(matthias);
  });
});