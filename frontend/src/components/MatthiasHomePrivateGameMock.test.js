import * as THREE from 'three';
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
  MATTHIAS_HOME_INTERACTION_SCENE_VERSION,
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

function worldPosition(node) {
  const target = new THREE.Vector3();
  node.getWorldPosition(target);
  return target;
}

describe('Matthias Home · Partida privada interaction scene', () => {
  it('ancla tablero y mesa al mundo y deja solo la coreografía de la mano en Matthias', () => {
    const host = new THREE.Scene();
    const rig = createMatthiasPremiumHome3D();
    host.add(rig.root);
    const pose = privateGamePose({ activityTime: 4.2 });

    applyMatthiasPremiumHomePose(rig, pose);
    expect(applyMatthiasHomePropErgonomics(rig, pose)).toBe('chess');
    expect(rig.activityRig.chess.visible).toBe(true);

    const scene = applyMatthiasHomePrivateGameRig(rig, pose);
    expect(scene).toBeTruthy();
    expect(scene.visible).toBe(true);
    expect(scene.userData.rigVersion).toBe(MATTHIAS_PRIVATE_GAME_RIG_VERSION);
    expect(scene.userData.homePropKind).toBe('environment');
    expect(scene.userData.homeAttachmentPolicy).toBe('never-hand');
    expect(rig.root.userData.activityPrivateGameComposition).toBe(MATTHIAS_PRIVATE_GAME_RIG_VERSION);
    expect(rig.root.userData.activityPrivateGameInteractionScene).toBe(MATTHIAS_HOME_INTERACTION_SCENE_VERSION);

    // El punto clave de la POC: muebles y tablero ya no son descendientes del peón.
    expect(rig.homeInteractionEnvironment).toBeTruthy();
    expect(rig.homeInteractionEnvironment.parent).toBe(host);
    expect(scene.parent).toBe(rig.homeInteractionEnvironment);
    expect(scene.parent).not.toBe(rig.activityRig.root);
    expect(rig.activityRig.privateGameActor.parent).toBe(rig.activityRig.root);
    expect(rig.activityRig.privateGameInteractionAnchor.userData.role).toBe('actor-anchor');

    // El antiguo mini-tablero y los guantes genéricos no pueden contaminar la escena.
    expect(rig.activityRig.chess.visible).toBe(false);
    expect(rig.activityRig.support.visible).toBe(false);
    expect(rig.activityRig.assist.visible).toBe(false);

    const board = scene.getObjectByName('private-game-board');
    const frame = scene.getObjectByName('private-game-board-frame');
    expect(board).toBeTruthy();
    expect(board.userData.homePropKind).toBe('environment');
    expect(board.userData.homeAttachmentPolicy).toBe('never-hand');
    expect(frame.geometry.parameters.width).toBeGreaterThanOrEqual(1.08);
    expect(scene.getObjectsByProperty('name', 'private-game-square')).toHaveLength(64);
    expect(rig.activityRig.privateGamePieces).toHaveLength(32);
    expect(rig.activityRig.privateGamePieces.filter((piece) => piece.userData.side === 'white')).toHaveLength(16);
    expect(rig.activityRig.privateGamePieces.filter((piece) => piece.userData.side === 'black')).toHaveLength(16);

    const hand = rig.activityRig.privateGameActor.getObjectByName('private-game-hand');
    const finger = rig.activityRig.privateGameActor.getObjectByName('private-game-pointing-finger');
    const sleeve = rig.activityRig.privateGameActor.getObjectByName('private-game-uniform-sleeve');
    expect(hand).toBeTruthy();
    expect(finger).toBeTruthy();
    expect(sleeve).toBeTruthy();
    expect(hand.material.color.getHex()).toBe(0xe1c58c);
    expect(rig.activityRig.privateGameMovingPiece?.userData?.privateGameMovingPiece).toBe(true);
    expect(rig.activityRig.privateGameMovingPiece?.userData?.homePropKind).toBe('handheld');
    expect(rig.activityRig.privateGameMovingPiece.position.z).toBeGreaterThan(.043);

    // Simula el bob corporal que antes convertía el tablero en una bandeja.
    host.updateMatrixWorld(true);
    const before = worldPosition(board);
    rig.root.position.y += .31;
    rig.root.rotation.z = .17;
    host.updateMatrixWorld(true);
    const after = worldPosition(board);
    expect(after.distanceTo(before)).toBeLessThan(1e-6);

    const suspiciousNames = [];
    scene.traverse((node) => {
      if (/knife|blade|cuchillo/i.test(node.name || '')) suspiciousNames.push(node.name);
    });
    expect(suspiciousNames).toEqual([]);

    clearMatthiasHomePrivateGameRig(rig);
    expect(scene.visible).toBe(false);
    expect(rig.activityRig.privateGameActor.visible).toBe(false);
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
