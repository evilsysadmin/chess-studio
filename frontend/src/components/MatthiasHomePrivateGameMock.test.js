import { describe, expect, it } from 'vitest';
import {
  applyMatthiasPremiumHomePose,
  createMatthiasPremiumHome3D,
  disposeMatthiasPremiumHome3D,
} from './MatthiasPremiumHome3D.js';
import { applyMatthiasHomePropErgonomics } from './matthiasHomePropErgonomics.js';
import {
  applyMatthiasHomePrivateGameRig,
  clearMatthiasHomePrivateGameRig,
  matthiasPrivateGameMotionState,
  MATTHIAS_PRIVATE_GAME_RIG_VERSION,
} from './matthiasHomePrivateGameRig.js';

function privateGamePose(overrides = {}) {
  return {
    bodyY: 0,
    bodyYaw: 0,
    headPitch: .02,
    headYaw: 0,
    headRoll: 0,
    gazeX: 0,
    browBias: .12,
    smirk: 0,
    mouthOpen: 0,
    blink: 0,
    reach: .42,
    activityProfile: 'think',
    ...overrides,
  };
}

describe('Matthias Home · Partida privada approved mock', () => {
  it('copia el mock: tablero grande, 32 piezas y mano entrando a mover una pieza', () => {
    const rig = createMatthiasPremiumHome3D();
    const pose = privateGamePose({ activityTime: 4.2 });

    applyMatthiasPremiumHomePose(rig, pose);
    expect(applyMatthiasHomePropErgonomics(rig, pose)).toBe('chess');
    expect(rig.activityRig.chess.visible).toBe(true);

    const scene = applyMatthiasHomePrivateGameRig(rig, pose);
    expect(scene).toBeTruthy();
    expect(scene.visible).toBe(true);
    expect(scene.userData.rigVersion).toBe(MATTHIAS_PRIVATE_GAME_RIG_VERSION);
    expect(rig.root.userData.activityPrivateGameComposition).toBe(MATTHIAS_PRIVATE_GAME_RIG_VERSION);

    // El antiguo mini-tablero y los guantes genéricos no pueden contaminar el mock.
    expect(rig.activityRig.chess.visible).toBe(false);
    expect(rig.activityRig.support.visible).toBe(false);
    expect(rig.activityRig.assist.visible).toBe(false);

    const board = rig.root.getObjectByName('private-game-board');
    const frame = rig.root.getObjectByName('private-game-board-frame');
    expect(board).toBeTruthy();
    expect(board.position.y).toBeGreaterThan(-.65);
    expect(frame.geometry.parameters.width).toBeGreaterThanOrEqual(1.08);
    expect(rig.root.getObjectsByProperty('name', 'private-game-square')).toHaveLength(64);
    expect(rig.activityRig.privateGamePieces).toHaveLength(32);
    expect(rig.activityRig.privateGamePieces.filter((piece) => piece.userData.side === 'white')).toHaveLength(16);
    expect(rig.activityRig.privateGamePieces.filter((piece) => piece.userData.side === 'black')).toHaveLength(16);

    const hand = rig.root.getObjectByName('private-game-hand');
    const finger = rig.root.getObjectByName('private-game-pointing-finger');
    const sleeve = rig.root.getObjectByName('private-game-uniform-sleeve');
    expect(hand).toBeTruthy();
    expect(finger).toBeTruthy();
    expect(sleeve).toBeTruthy();
    expect(hand.material.color.getHex()).toBe(0xe1c58c);
    expect(rig.activityRig.privateGameMovingPiece?.userData?.privateGameMovingPiece).toBe(true);
    expect(rig.activityRig.privateGameMovingPiece.position.z).toBeGreaterThan(.043);

    const suspiciousNames = [];
    rig.activityRig.privateGame.traverse((node) => {
      if (/knife|blade|cuchillo/i.test(node.name || '')) suspiciousNames.push(node.name);
    });
    expect(suspiciousNames).toEqual([]);

    clearMatthiasHomePrivateGameRig(rig);
    expect(scene.visible).toBe(false);
    expect(rig.root.userData.activityPrivateGameComposition).toBe('inactive');
    disposeMatthiasPremiumHome3D(rig);
  });

  it('mueve una pieza despacio y reduced-motion conserva una pose legible', () => {
    const before = matthiasPrivateGameMotionState(1.0);
    const reaching = matthiasPrivateGameMotionState(3.2);
    const moving = matthiasPrivateGameMotionState(4.3);
    const reduced = matthiasPrivateGameMotionState(4.3, { reducedMotion: true });

    expect(before.reach).toBeLessThan(reaching.reach);
    expect(moving.slide).toBeGreaterThan(0);
    expect(moving.lift).toBeGreaterThan(0);
    expect(reduced.reach).toBeGreaterThan(.4);
    expect(reduced.lift).toBeGreaterThan(0);
  });
});
