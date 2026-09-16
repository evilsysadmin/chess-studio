import { describe, expect, it } from 'vitest';
import { buildScavengerKnight } from './chroniclesOfMatthiasScavengerKnight.js';
import {
  chroniclesEnemyMotionPose,
  installChroniclesEnemyMotionArt,
} from './chroniclesEnemyMotionArt.js';

function firstMesh(root) {
  let result = null;
  root.traverse((node) => {
    if (!result && node.isMesh) result = node;
  });
  return result;
}

describe('Chronicles enemy motion art', () => {
  it('amplifies authored motion while a creature is actually translating', () => {
    const idle = chroniclesEnemyMotionPose('scavenger-knight', 1.23, 0);
    const moving = chroniclesEnemyMotionPose('scavenger-knight', 1.23, 1);

    expect(Math.abs(moving.primary)).toBeGreaterThan(Math.abs(idle.primary));
    expect(moving.lift).toBeGreaterThanOrEqual(idle.lift);
  });

  it('uses distinct motion signatures for grounded, spectral and knight threats', () => {
    const pawn = chroniclesEnemyMotionPose('corrupted-pawn', 0.73, 0.8);
    const jailer = chroniclesEnemyMotionPose('gate-jailer', 0.73, 0.8);
    const bishop = chroniclesEnemyMotionPose('spectral-bishop', 0.73, 0.8);
    const knight = chroniclesEnemyMotionPose('scavenger-knight', 0.73, 0.8);

    expect(new Set([pawn.primary, jailer.primary, bishop.primary, knight.primary]).size).toBe(4);
    expect(bishop.lift).toBeGreaterThan(0);
  });

  it('reduces animation amplitude for coarse devices', () => {
    const desktop = chroniclesEnemyMotionPose('corrupted-pawn', 1.17, 1, { coarsePointer: false });
    const coarse = chroniclesEnemyMotionPose('corrupted-pawn', 1.17, 1, { coarsePointer: true });

    expect(Math.abs(coarse.primary)).toBeLessThan(Math.abs(desktop.primary));
    expect(coarse.lift).toBeLessThan(desktop.lift);
  });

  it('installs one render hook, preserves named rig parts and exposes cleanup', () => {
    const knight = buildScavengerKnight();
    const sentinel = firstMesh(knight);
    const neck = knight.getObjectByName('scavenger-knight-neck-rig');
    const baseRotation = neck.rotation.x;

    installChroniclesEnemyMotionArt(knight, 'scavenger-knight', { reducedMotion: false });
    const installedHook = sentinel.onBeforeRender;
    installChroniclesEnemyMotionArt(knight, 'scavenger-knight', { reducedMotion: false });

    expect(knight.userData.chroniclesEnemyMotionInstalled).toBe(true);
    expect(knight.userData.chroniclesEnemyMotionVisualType).toBe('scavenger-knight');
    expect(knight.userData.chroniclesEnemyMotionCancel).toBeTypeOf('function');
    expect(sentinel.onBeforeRender).toBe(installedHook);

    knight.position.x = 0.3;
    sentinel.onBeforeRender();
    knight.userData.chroniclesEnemyMotionCancel();
    expect(neck.rotation.x).toBeCloseTo(baseRotation, 6);
  });

  it('respects reduced motion without attaching a per-frame animation hook', () => {
    const knight = buildScavengerKnight();
    const sentinel = firstMesh(knight);
    const before = sentinel.onBeforeRender;

    installChroniclesEnemyMotionArt(knight, 'scavenger-knight', { reducedMotion: true });

    expect(knight.userData.chroniclesEnemyMotionInstalled).toBe(true);
    expect(sentinel.onBeforeRender).toBe(before);
    expect(knight.userData.chroniclesEnemyMotionCancel).toBeUndefined();
  });
});
