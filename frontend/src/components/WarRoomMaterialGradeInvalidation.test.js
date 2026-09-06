import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  applyWarRoomMaterialGrade,
  shouldRunWarRoomMaterialGrade,
  warRoomMaterialGradeDynamicSignature,
} from './WarRoom3DMotion.js';

function material(role) {
  const value = new THREE.MeshPhysicalMaterial({
    color: role === 'board-light' ? 0xd9cfba : 0xd8c7aa,
    envMapIntensity: 0.64,
    roughness: 0.36,
    clearcoat: 0.44,
    clearcoatRoughness: 0.24,
    specularIntensity: 0.56,
    sheen: 0.04,
    sheenRoughness: 0.5,
  });
  value.userData.surfaceRole = role;
  return value;
}

function mesh(role) {
  return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material(role));
}

function fixture() {
  const scene = new THREE.Scene();
  scene.userData.warRoomRenderBudget = { shadowMapSize: 1024 };

  const board = new THREE.Group();
  const tile = mesh('board-light');
  board.add(tile);

  const pieces = new THREE.Group();
  const firstPiece = mesh('ivory');
  pieces.add(firstPiece);
  board.add(pieces);

  const forensic = new THREE.Group();
  board.add(forensic);
  scene.add(board);

  return { scene, board, tile, pieces, forensic, firstPiece };
}

describe('War Room material grade invalidation', () => {
  it('runs once for a stable board instead of following the ambient render cadence', () => {
    const { scene, board } = fixture();

    expect(warRoomMaterialGradeDynamicSignature(board)).not.toBe('');
    expect(shouldRunWarRoomMaterialGrade(scene)).toBe(true);
    expect(shouldRunWarRoomMaterialGrade(scene)).toBe(false);
    expect(shouldRunWarRoomMaterialGrade(scene)).toBe(false);
    expect(scene.userData).toMatchObject({
      warRoomMaterialGradeTraversal: 'board-root-v1',
      warRoomMaterialGradeMode: 'dynamic-groups-v1',
      warRoomMaterialGradeInvalidations: 1,
    });
  });

  it('invalidates when pieces are rebuilt even if the piece count is unchanged', () => {
    const { scene, pieces, firstPiece } = fixture();
    expect(shouldRunWarRoomMaterialGrade(scene)).toBe(true);
    applyWarRoomMaterialGrade(scene);
    expect(shouldRunWarRoomMaterialGrade(scene)).toBe(false);

    pieces.remove(firstPiece);
    const replacement = mesh('ivory');
    pieces.add(replacement);

    expect(pieces.children).toHaveLength(1);
    expect(shouldRunWarRoomMaterialGrade(scene)).toBe(true);
    expect(shouldRunWarRoomMaterialGrade(scene)).toBe(false);

    const before = replacement.material.color.getHex();
    const result = applyWarRoomMaterialGrade(scene);
    expect(result.ivory).toBeGreaterThanOrEqual(1);
    expect(replacement.material.envMapIntensity).toBe(0.18);
    expect(replacement.material.roughness).toBeGreaterThanOrEqual(0.74);
    expect(replacement.material.color.getHex()).not.toBe(before);
  });

  it('invalidates when a forensic or capture-style group gains a transient piece', () => {
    const { scene, forensic } = fixture();
    expect(shouldRunWarRoomMaterialGrade(scene)).toBe(true);
    expect(shouldRunWarRoomMaterialGrade(scene)).toBe(false);

    forensic.add(mesh('ivory'));
    expect(shouldRunWarRoomMaterialGrade(scene)).toBe(true);
    expect(scene.userData.warRoomMaterialGradeInvalidations).toBe(2);
  });
});
