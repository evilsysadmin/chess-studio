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

  it('gives the knight a readable landing rebound while keeping the queen restrained', () => {
    const knight = derivePieceBodyPose({ type: 'n', progress: 0.91, dx: 1, dz: 0, airborne: 0.05 });
    const queen = derivePieceBodyPose({ type: 'q', progress: 0.91, dx: 1, dz: 0, airborne: 0.05 });

    expect(knight.finish.rebound).toBeGreaterThan(0.95);
    expect(knight.yOffset).toBeGreaterThan(queen.yOffset);
    expect(knight.scaleY).toBeGreaterThan(queen.scaleY);
  });

  it('counter-brakes the rook near arrival while the queen stays precise', () => {
    const rook = derivePieceBodyPose({ type: 'r', progress: 0.78, dx: 1, dz: 0 });
    const queen = derivePieceBodyPose({ type: 'q', progress: 0.78, dx: 1, dz: 0 });

    expect(rook.finish.braking).toBeGreaterThan(0.95);
    expect(rook.roll).toBeGreaterThan(0);
    expect(queen.roll).toBeLessThan(0);
    expect(Math.abs(rook.roll)).toBeGreaterThan(Math.abs(queen.roll));
  });

  it('lunges a pawn only on diagonal capture travel', () => {
    const capture = derivePieceBodyPose({ type: 'p', progress: 0.67, dx: 1, dz: 1 });
    const quiet = derivePieceBodyPose({ type: 'p', progress: 0.67, dx: 1, dz: 0 });

    expect(capture.finish.diagonalPawnCapture).toBe(true);
    expect(capture.xOffset).toBeGreaterThan(0.03);
    expect(capture.zOffset).toBeGreaterThan(0.03);
    expect(quiet.finish.diagonalPawnCapture).toBe(false);
    expect(quiet.xOffset).toBe(0);
    expect(quiet.zOffset).toBe(0);
  });

  it('braces the king only for castling-distance travel', () => {
    const castle = derivePieceBodyPose({ type: 'k', progress: 0.48, dx: 1, dz: 0, travelDistance: 2 });
    const quiet = derivePieceBodyPose({ type: 'k', progress: 0.48, dx: 1, dz: 0, travelDistance: 1 });

    expect(castle.finish.castleBrace).toBe(true);
    expect(Math.abs(castle.yaw)).toBeGreaterThan(0.015);
    expect(quiet.finish.castleBrace).toBe(false);
    expect(quiet.yaw).toBe(0);
  });

  it('turns the existing promotion pulse into a restrained upward finish', () => {
    const promoted = derivePieceBodyPose({ type: 'q', progress: 0.82, dx: 0, dz: 1, promotionEnergy: 1 });
    const normal = derivePieceBodyPose({ type: 'q', progress: 0.82, dx: 0, dz: 1, promotionEnergy: 0 });

    expect(promoted.finish.promotion).toBe(true);
    expect(promoted.yOffset).toBeGreaterThan(normal.yOffset);
    expect(promoted.scaleY).toBeGreaterThan(normal.scaleY + 0.03);
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
    expect(root.userData.board3DBodyFinishProfile).toBe('piece-finish-v1');
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
    expect(root.userData.board3DBodyFinishProfile).toBe('piece-finish-v1');
    expect(body).toBeTruthy();
    expect(visual.parent).toBe(body);
    expect(shadow.parent).toBe(root);
  });
});
