import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { installPieceBodyMotion, resetPieceBodyMotion } from './WarRoomPieceBodyMotionImpl.js';

describe('War Room body pose cached destination', () => {
  it('recomputes only when a new square is selected and handles reset and reconciliation', () => {
    const piece = new THREE.Group();
    piece.position.set(0.5, 0.1, 2.5);
    piece.userData.square = 'e4';
    piece.userData.baseY = 0.1;
    piece.userData.baseScale = piece.scale.clone();

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.4, 0.25), new THREE.MeshBasicMaterial());
    piece.add(mesh);
    installPieceBodyMotion(piece, 'p', { reducedMotion: false });
    const renderer = { info: { render: { frame: 0 } }, userData: { board3DMotionNowMs: 1000 } };
    const paint = (frame) => {
      renderer.info.render.frame = frame;
      mesh.onBeforeRender(renderer);
    };

    paint(1);
    expect(piece.userData.board3DBodyFinishState).toBeTruthy();
    // Holding the same target over several distinct frames must still animate.
    paint(2);
    expect(piece.userData.board3DBodyFinishState).toBeTruthy();

    piece.position.z = 0.5;
    paint(3);
    expect(piece.userData.board3DBodyFinishState).toBeNull();

    // The same mesh now moves towards a new destination without remounting.
    piece.userData.square = 'f4';
    paint(4);
    expect(piece.userData.board3DBodyFinishState).toBeTruthy();
    piece.position.x = 1.5;
    paint(5);
    expect(piece.userData.board3DBodyFinishState).toBeNull();

    // Hard reset invalidates transient motion but leaves the immutable
    // destination coordinates correct for the next same-piece move.
    piece.userData.square = 'g4';
    paint(6);
    expect(piece.userData.board3DBodyFinishState).toBeTruthy();
    expect(resetPieceBodyMotion(piece)).toBe(true);
    expect(piece.userData.board3DBodyFinishState).toBeNull();
    paint(7);
    expect(piece.userData.board3DBodyFinishState).toBeTruthy();
    piece.position.x = 2.5;
    paint(8);
    expect(piece.userData.board3DBodyFinishState).toBeNull();

    mesh.geometry.dispose();
    mesh.material.dispose();
  });
});
