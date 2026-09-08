import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { addPieceSkinDetails } from './Board3DSkinDecor.js';
import { derivePieceBodyPose, derivePromotionMorph, installPieceBodyMotion } from './WarRoomPieceBodyMotion.js';
import { armWarRoomMoveFinishEvent, clearWarRoomMoveFinishEvent } from './WarRoomMoveFinishEvent.js';

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
    expect(Math.abs(quiet.yaw)).toBe(0);
  });

  it('loads the rook while it waits, then lets king and rook lock the castle together', () => {
    const rookWaiting = derivePieceBodyPose({ type: 'r', progress: 0.02, dx: 1, dz: 0, castlingRole: 'rook' });
    const rookQuiet = derivePieceBodyPose({ type: 'r', progress: 0.02, dx: 1, dz: 0 });
    const kingLock = derivePieceBodyPose({ type: 'k', progress: 0.90, dx: 1, dz: 0, travelDistance: 2, castlingRole: 'king' });
    const rookLock = derivePieceBodyPose({ type: 'r', progress: 0.90, dx: 1, dz: 0, castlingRole: 'rook' });

    expect(rookWaiting.finish.castlingRole).toBe('rook');
    expect(rookWaiting.finish.castleResponse).toBeGreaterThan(0.95);
    expect(rookWaiting.scaleY).toBeLessThan(rookQuiet.scaleY);
    expect(kingLock.finish.castlingRole).toBe('king');
    expect(kingLock.finish.castleLock).toBeGreaterThan(0.95);
    expect(rookLock.finish.castleLock).toBeGreaterThan(0.95);
  });

  it('turns the existing promotion pulse into a restrained upward finish', () => {
    const promoted = derivePieceBodyPose({ type: 'q', progress: 0.82, dx: 0, dz: 1, promotionEnergy: 1 });
    const normal = derivePieceBodyPose({ type: 'q', progress: 0.82, dx: 0, dz: 1, promotionEnergy: 0 });

    expect(promoted.finish.promotion).toBe(true);
    expect(promoted.yOffset).toBeGreaterThan(normal.yOffset);
    expect(promoted.scaleY).toBeGreaterThan(normal.scaleY + 0.03);
  });

  it('seals only a real checkmate finish with a restrained final posture', () => {
    const mate = derivePieceBodyPose({ type: 'q', progress: 0.90, dx: 1, dz: 0, checkmateFinish: true });
    const quiet = derivePieceBodyPose({ type: 'q', progress: 0.90, dx: 1, dz: 0 });

    expect(mate.finish.checkmate).toBe(true);
    expect(quiet.finish.checkmate).toBe(false);
    expect(mate.yOffset).toBeGreaterThan(quiet.yOffset);
    expect(mate.scaleY).toBeGreaterThan(quiet.scaleY);
    expect(mate.scaleXZ).toBeLessThan(quiet.scaleXZ);
  });

  it('consumes a mate event only when the actual moving piece reaches that target', () => {
    clearWarRoomMoveFinishEvent();
    const root = new THREE.Group();
    const visual = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    root.add(visual);
    root.userData.square = 'h8';
    root.userData.baseY = 0.1;
    root.userData.baseScale = root.scale.clone();
    root.position.set(2.5, 0.1, -3.5);

    installPieceBodyMotion(root, 'q');
    armWarRoomMoveFinishEvent({ seq: 77, to: 'h8', checkmate: true });

    visual.onBeforeRender({ info: { render: { frame: 1 } } });
    root.position.x = 3.4;
    visual.onBeforeRender({ info: { render: { frame: 2 } } });

    expect(root.userData.board3DBodyFinishState?.checkmate).toBe(true);
    clearWarRoomMoveFinishEvent();
  });

  it('gives both reconciled castling pieces their own coordinated role', () => {
    clearWarRoomMoveFinishEvent();
    const king = new THREE.Group();
    const kingVisual = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    king.add(kingVisual);
    king.userData.square = 'g1';
    king.userData.baseY = 0.1;
    king.userData.baseScale = king.scale.clone();
    king.position.set(0.5, 0.1, 3.5);

    const rook = new THREE.Group();
    const rookVisual = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    rook.add(rookVisual);
    rook.userData.square = 'f1';
    rook.userData.baseY = 0.1;
    rook.userData.baseScale = rook.scale.clone();
    rook.position.set(3.5, 0.1, 3.5);

    installPieceBodyMotion(king, 'k');
    installPieceBodyMotion(rook, 'r');
    armWarRoomMoveFinishEvent({
      seq: 78,
      to: 'g1',
      castling: { side: 'king', kingTo: 'g1', rookTo: 'f1' },
    });

    kingVisual.onBeforeRender({ info: { render: { frame: 1 } } });
    rookVisual.onBeforeRender({ info: { render: { frame: 1 } } });

    expect(king.userData.board3DBodyFinishState?.castlingRole).toBe('king');
    expect(rook.userData.board3DBodyFinishState?.castlingRole).toBe('rook');
    clearWarRoomMoveFinishEvent();
  });


  it('morphs a promotion from a readable pawn silhouette into the chosen piece', () => {
    const early = derivePromotionMorph({ progress: 0.3 });
    const overlap = derivePromotionMorph({ progress: 0.90 });
    const sealed = derivePromotionMorph({ progress: 0.97 });
    const coarse = derivePromotionMorph({ progress: 0.97, coarsePointer: true });

    expect(early.pawnOpacity).toBe(1);
    expect(early.promotedOpacity).toBe(0);
    expect(overlap.pawnOpacity).toBeGreaterThan(0);
    expect(overlap.pawnOpacity).toBeLessThan(1);
    expect(overlap.promotedOpacity).toBeGreaterThan(0);
    expect(overlap.promotedOpacity).toBeLessThan(1);
    expect(sealed.promotedOpacity).toBe(1);
    expect(sealed.pawnOpacity).toBe(0);
    expect(sealed.promotedScale).toBeGreaterThan(1);
    expect(coarse.promotedScale - 1).toBeLessThan(sealed.promotedScale - 1);
  });

  it('uses an exact promotion event to travel as a pawn, crossfade, then restore the real piece', () => {
    clearWarRoomMoveFinishEvent();
    const root = new THREE.Group();
    const visual = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ opacity: 1 }));
    root.add(visual);
    root.userData.square = 'g8';
    root.userData.baseY = 0.1;
    root.userData.baseScale = root.scale.clone();
    root.position.set(2.5, 0.1, -2.5);

    installPieceBodyMotion(root, 'q');
    armWarRoomMoveFinishEvent({
      seq: 88,
      to: 'g8',
      promotion: { from: 'g7', to: 'g8', promotedType: 'q', color: 'w' },
    });

    visual.onBeforeRender({ info: { render: { frame: 1 } } });
    const ghost = root.getObjectByName('board3d-promotion-pawn-ghost');
    expect(ghost).toBeTruthy();
    expect(root.userData.board3DPromotionMorphState?.promotedType).toBe('q');
    expect(root.userData.board3DPromotionMorphState?.promotedOpacity).toBe(0);
    expect(root.userData.board3DBodyFinishState?.promotionMorph).toBe(true);
    expect(visual.material.colorWrite).toBe(false);

    root.position.z = -3.40;
    visual.onBeforeRender({ info: { render: { frame: 2 } } });
    expect(root.userData.board3DPromotionMorphState?.pawnOpacity).toBeLessThan(1);
    expect(root.userData.board3DPromotionMorphState?.promotedOpacity).toBeGreaterThan(0);

    root.position.z = -3.5;
    visual.onBeforeRender({ info: { render: { frame: 3 } } });
    expect(root.getObjectByName('board3d-promotion-pawn-ghost')).toBeUndefined();
    expect(root.userData.board3DPromotionMorphState).toBeNull();
    expect(visual.material.opacity).toBe(1);
    expect(visual.material.transparent).toBe(false);
    expect(visual.material.colorWrite).toBe(true);
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
    expect(root.userData.board3DCheckmateFinishProfile).toBe('mate-seal-v1');
    expect(root.userData.board3DCastlingFinishProfile).toBe('castle-lock-v1');
    expect(root.userData.board3DPromotionMorphProfile).toBe('pawn-morph-v1');
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
    expect(root.userData.board3DCheckmateFinishProfile).toBe('mate-seal-v1');
    expect(root.userData.board3DCastlingFinishProfile).toBe('castle-lock-v1');
    expect(root.userData.board3DPromotionMorphProfile).toBe('pawn-morph-v1');
    expect(body).toBeTruthy();
    const visualBody = body.children.find((child) => child.userData?.board3DVisualBody);
    expect(visualBody).toBeTruthy();
    expect(visual.parent).toBe(visualBody);
    expect(shadow.parent).toBe(root);
  });
});
