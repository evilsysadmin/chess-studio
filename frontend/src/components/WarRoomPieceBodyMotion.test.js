import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { addPieceSkinDetails } from './Board3DSkinDecor.js';
import { derivePieceBodyPose, installPieceBodyMotion } from './WarRoomPieceBodyMotion.js';

describe('War Room piece body motion', () => {
  it('gives each piece a distinct physical signature', () => {
    const sample = (type) => derivePieceBodyPose({ type, progress: 0.5, dx: 1, dz: 1, airborne: 0.7 });
    const pawn = sample('p');
    const knight = sample('n');
    const bishop = sample('b');
    const rook = sample('r');
    const queen = sample('q');
    const king = sample('k');

    expect(Math.abs(knight.pitch)).toBeGreaterThan(Math.abs(pawn.pitch));
    expect(Math.abs(pawn.pitch)).toBeGreaterThan(Math.abs(bishop.pitch));
    expect(Math.abs(queen.pitch)).toBeGreaterThan(Math.abs(rook.pitch));
    expect(Math.abs(rook.pitch)).toBeGreaterThan(Math.abs(king.pitch));
    expect(knight.scaleY).toBeGreaterThan(queen.scaleY);
  });

  it('loads the knight before launch and makes the rook land heavier than the queen', () => {
    const knightStart = derivePieceBodyPose({ type: 'n', progress: 0, dx: 1, dz: 0 });
    const pawnStart = derivePieceBodyPose({ type: 'p', progress: 0, dx: 1, dz: 0 });
    const rookLanding = derivePieceBodyPose({ type: 'r', progress: 0.84, dx: 1, dz: 0 });
    const queenLanding = derivePieceBodyPose({ type: 'q', progress: 0.84, dx: 1, dz: 0 });

    expect(knightStart.scaleY).toBeLessThan(pawnStart.scaleY);
    expect(knightStart.roll).toBeGreaterThan(0);
    expect(rookLanding.scaleY).toBeLessThan(queenLanding.scaleY);
  });

  it('damps body motion on coarse pointers', () => {
    const desktop = derivePieceBodyPose({ type: 'n', progress: 0.5, dx: 1, dz: 0, airborne: 0.8 });
    const coarse = derivePieceBodyPose({ type: 'n', progress: 0.5, dx: 1, dz: 0, airborne: 0.8, coarsePointer: true });

    expect(Math.abs(coarse.roll)).toBeLessThan(Math.abs(desktop.roll));
    expect(Math.abs(coarse.scaleY - 1)).toBeLessThan(Math.abs(desktop.scaleY - 1));
  });

  it('wires body motion through the existing skin-detail build path', () => {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
    root.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 8), material));

    addPieceSkinDetails(root, 'p', 'studio', material, false);

    expect(root.userData.skin3DIdentity).toBe('distinct-v2');
    expect(root.userData.board3DBodyMotionProfile).toBe('piece-body-v1');
    expect(root.children.some((child) => child.userData?.board3DBodyMotionBody)).toBe(true);
  });

  it('keeps root contracts and static root children outside the moving body', () => {
    const root = new THREE.Group();
    const visual = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 8), new THREE.MeshBasicMaterial());
    shadow.userData.contactShadow = true;
    root.add(visual, shadow);

    installPieceBodyMotion(root, 'r');

    const body = root.children.find((child) => child.userData?.board3DBodyMotionBody);
    expect(root.userData.board3DBodyMotionProfile).toBe('piece-body-v1');
    expect(body).toBeTruthy();
    expect(visual.parent).toBe(body);
    expect(shadow.parent).toBe(root);
  });
});
