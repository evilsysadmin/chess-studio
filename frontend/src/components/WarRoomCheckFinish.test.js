import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { chessFromFen } from '../chessRules.js';
import {
  armWarRoomMoveFinishEvent,
  clearWarRoomMoveFinishEvent,
  consumeWarRoomMoveFinishEvent,
  deriveWarRoomMoveFinishEvent,
} from './WarRoomMoveFinishEvent.js';
import {
  derivePassiveCheckSettle,
  derivePieceBodyPose,
  installPieceBodyMotion,
} from './WarRoomPieceBodyMotion.js';

const DIRECT_CHECK_FEN = '4k3/4R3/8/8/8/8/8/4K3 b - - 0 1';
const DISCOVERED_CHECK_FEN = '4k3/8/8/8/8/5B2/8/K3R3 b - - 0 1';
const DOUBLE_CHECK_FEN = '4k3/8/8/1B6/8/8/8/K3R3 b - - 0 1';
const MATE_FEN = '7k/6Q1/5K2/8/8/8/8/8 b - - 0 1';

function makePieceRoot(square = 'e1') {
  const root = new THREE.Group();
  const visual = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  root.add(visual);
  root.userData.square = square;
  root.userData.baseY = 0.1;
  root.userData.baseScale = root.scale.clone();
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  root.position.set(file - 3.5, 0.1, 4.5 - rank);
  return { root, visual };
}

describe('War Room exact check finish', () => {
  it('does not parse quiet moves when checkSquare and special events are absent', () => {
    let parses = 0;
    const event = deriveWarRoomMoveFinishEvent({
      fen: 'irrelevant',
      animate: { seq: 39, from: 'a2', to: 'a3' },
      chessFromFen: () => {
        parses += 1;
        throw new Error('quiet move should not parse');
      },
    });

    expect(event).toBeNull();
    expect(parses).toBe(0);
  });

  it('targets the moving checker on a direct non-mate check', () => {
    const event = deriveWarRoomMoveFinishEvent({
      fen: DIRECT_CHECK_FEN,
      checkSquare: 'e8',
      animate: { seq: 40, from: 'e2', to: 'e7' },
      chessFromFen,
    });

    expect(event).toEqual({ seq: 40, to: 'e7', checkers: ['e7'] });
    clearWarRoomMoveFinishEvent();
    armWarRoomMoveFinishEvent(event);
    expect(consumeWarRoomMoveFinishEvent('e7')).toEqual({
      seq: 40,
      to: 'e7',
      check: true,
      checkRole: 'moving',
    });
  });

  it('targets the stationary rook on a discovered check instead of the moved bishop', () => {
    const event = deriveWarRoomMoveFinishEvent({
      fen: DISCOVERED_CHECK_FEN,
      checkSquare: 'e8',
      animate: { seq: 41, from: 'e2', to: 'f3' },
      chessFromFen,
    });

    expect(event).toEqual({ seq: 41, to: 'f3', checkers: ['e1'] });
    clearWarRoomMoveFinishEvent();
    armWarRoomMoveFinishEvent(event);
    expect(consumeWarRoomMoveFinishEvent('f3')).toBeNull();
    expect(consumeWarRoomMoveFinishEvent('e1')).toEqual({
      seq: 41,
      to: 'e1',
      check: true,
      checkRole: 'stationary',
    });
  });

  it('queues both real attackers on a double check', () => {
    const event = deriveWarRoomMoveFinishEvent({
      fen: DOUBLE_CHECK_FEN,
      checkSquare: 'e8',
      animate: { seq: 42, from: 'e2', to: 'b5' },
      chessFromFen,
    });

    expect(event).toEqual({ seq: 42, to: 'b5', checkers: ['b5', 'e1'] });
    clearWarRoomMoveFinishEvent();
    armWarRoomMoveFinishEvent(event);
    expect(consumeWarRoomMoveFinishEvent('b5')?.checkRole).toBe('moving');
    expect(consumeWarRoomMoveFinishEvent('e1')?.checkRole).toBe('stationary');
  });

  it('keeps mate as the stronger finish instead of stacking ordinary check settle', () => {
    const event = deriveWarRoomMoveFinishEvent({
      fen: MATE_FEN,
      gameOver: true,
      checkSquare: 'h8',
      animate: { seq: 43, from: 'f7', to: 'g7' },
      chessFromFen,
    });

    expect(event).toEqual({ seq: 43, to: 'g7', checkmate: true });
  });

  it('merges check with promotion or castling on the same checker square', () => {
    clearWarRoomMoveFinishEvent();
    armWarRoomMoveFinishEvent({
      seq: 44,
      to: 'g8',
      checkers: ['g8'],
      promotion: { from: 'g7', to: 'g8', promotedType: 'q', color: 'w' },
    });
    expect(consumeWarRoomMoveFinishEvent('g8')).toMatchObject({
      seq: 44,
      to: 'g8',
      check: true,
      checkRole: 'moving',
      promotion: { promotedType: 'q' },
    });

    clearWarRoomMoveFinishEvent();
    armWarRoomMoveFinishEvent({
      seq: 45,
      to: 'g1',
      checkers: ['f1'],
      castling: { side: 'king', kingTo: 'g1', rookTo: 'f1' },
    });
    expect(consumeWarRoomMoveFinishEvent('f1')).toMatchObject({
      seq: 45,
      to: 'f1',
      castlingRole: 'rook',
      check: true,
      checkRole: 'moving',
    });
  });

  it('adds only a restrained settle to a moving checker', () => {
    const check = derivePieceBodyPose({ type: 'r', progress: 0.88, dx: 1, dz: 0, checkFinish: true });
    const quiet = derivePieceBodyPose({ type: 'r', progress: 0.88, dx: 1, dz: 0 });

    expect(check.finish.check).toBe(true);
    expect(quiet.finish.check).toBe(false);
    expect(check.scaleY).toBeLessThan(quiet.scaleY);
    expect(check.scaleXZ).toBeGreaterThan(quiet.scaleXZ);
  });

  it('keeps passive settle short, subtle and damped on coarse pointers', () => {
    const desktop = derivePassiveCheckSettle({ elapsedMs: 84 });
    const coarse = derivePassiveCheckSettle({ elapsedMs: 65, coarsePointer: true });
    const reduced = derivePassiveCheckSettle({ elapsedMs: 60, reducedMotion: true });

    expect(desktop.active).toBe(true);
    expect(desktop.settle).toBeGreaterThan(0.9);
    expect(desktop.scaleY).toBeLessThan(1);
    expect(coarse.settle).toBeLessThan(desktop.settle);
    expect(reduced).toMatchObject({ active: false, done: true, settle: 0, scaleY: 1, scaleXZ: 1 });
  });

  it('lets a stationary discovered checker settle without moving the piece root', () => {
    clearWarRoomMoveFinishEvent();
    const { root, visual } = makePieceRoot('e1');
    installPieceBodyMotion(root, 'r', { reducedMotion: false });
    armWarRoomMoveFinishEvent({ seq: 90, to: 'f3', checkers: ['e1'] });
    const renderer = { info: { render: { frame: 1 } }, userData: { board3DMotionNowMs: 1000 } };

    visual.onBeforeRender(renderer);
    expect(root.userData.board3DBodyFinishState).toMatchObject({ check: true, passiveCheck: true });
    expect(root.userData.board3DCheckSettleState).toMatchObject({ seq: 90, role: 'stationary' });
    expect(root.position.x).toBe(0.5);
    expect(root.position.z).toBe(3.5);

    renderer.info.render.frame = 2;
    renderer.userData.board3DMotionNowMs = 1084;
    visual.onBeforeRender(renderer);
    const body = root.children.find((child) => child.userData?.board3DBodyMotionBody);
    expect(body.scale.y).toBeLessThan(1);

    renderer.info.render.frame = 3;
    renderer.userData.board3DMotionNowMs = 1200;
    visual.onBeforeRender(renderer);
    expect(root.userData.board3DCheckSettleState).toBeNull();
    expect(root.userData.board3DBodyFinishState).toBeNull();
    expect(body.scale.y).toBe(1);
  });

  it('consumes stationary check without animating it under reduced motion', () => {
    clearWarRoomMoveFinishEvent();
    const { root, visual } = makePieceRoot('e1');
    installPieceBodyMotion(root, 'r', { reducedMotion: true });
    armWarRoomMoveFinishEvent({ seq: 91, to: 'f3', checkers: ['e1'] });
    visual.onBeforeRender({ info: { render: { frame: 1 } }, userData: { board3DMotionNowMs: 1000 } });

    expect(root.userData.board3DCheckFinishProfile).toBe('check-settle-reduced-v1');
    expect(root.userData.board3DCheckSettleState).toBeNull();
    expect(root.userData.board3DBodyFinishState).toBeNull();
  });
});
