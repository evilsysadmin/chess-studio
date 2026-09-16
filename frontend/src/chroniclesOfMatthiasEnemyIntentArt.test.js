import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CHRONICLES_TACTICS_ENEMY_INTENT,
  chroniclesTacticsEnemyMotion,
  installChroniclesTacticsEnemyIntentArt,
} from './chroniclesOfMatthiasEnemyIntentArt.js';

function enemyScene() {
  const scene = new THREE.Scene();
  const enemy = new THREE.Group();
  enemy.name = 'chronicles-iso-enemy-corrupted-pawn';
  enemy.userData.chroniclesIsoEnemyId = 'corrupted-pawn';
  enemy.userData.chroniclesIsoTarget = new THREE.Vector3(2.45, 0, 0);
  enemy.position.set(0, 0, 0);
  enemy.visible = true;
  scene.add(enemy);
  return { scene, enemy };
}

describe('Chronicles Tactics enemy intent art', () => {
  it('classifies only meaningful world-space movement as motion', () => {
    expect(chroniclesTacticsEnemyMotion({ x: 0, z: 0 }, { x: 0.02, z: 0.02 }).moving).toBe(false);
    const motion = chroniclesTacticsEnemyMotion({ x: 0, z: 0 }, { x: 2.45, z: 0 });
    expect(motion.moving).toBe(true);
    expect(motion.distance).toBeCloseTo(2.45, 6);
    expect(CHRONICLES_TACTICS_ENEMY_INTENT.movementThreshold).toBeLessThan(0.2);
  });

  it('updates a destination cue only when the renderer assigns a target', async () => {
    const { scene, enemy } = enemyScene();
    const root = installChroniclesTacticsEnemyIntentArt(scene, { coarsePointer: false });
    await Promise.resolve();

    const frame = root.getObjectByName('chronicles-tactics-enemy-target-corrupted-pawn');
    const path = root.getObjectByName('chronicles-tactics-enemy-path-corrupted-pawn');
    expect(frame.visible).toBe(true);
    expect(path.visible).toBe(true);
    expect(frame.position.x).toBeCloseTo(2.45, 6);

    enemy.position.copy(enemy.userData.chroniclesIsoTarget);
    enemy.userData.chroniclesIsoTarget = new THREE.Vector3(2.45, 0, 0);
    expect(frame.visible).toBe(false);
    expect(path.visible).toBe(false);
  });

  it('is idempotent and keeps coarse-pointer cues lightweight', async () => {
    const { scene, enemy } = enemyScene();
    const first = installChroniclesTacticsEnemyIntentArt(scene, { coarsePointer: true });
    const second = installChroniclesTacticsEnemyIntentArt(scene, { coarsePointer: true });
    expect(second).toBe(first);
    await Promise.resolve();

    const frame = first.getObjectByName('chronicles-tactics-enemy-target-corrupted-pawn');
    const path = first.getObjectByName('chronicles-tactics-enemy-path-corrupted-pawn');
    expect(frame.visible).toBe(true);
    expect(path.visible).toBe(false);

    enemy.position.copy(enemy.userData.chroniclesIsoTarget);
    enemy.userData.chroniclesIsoTarget = enemy.userData.chroniclesIsoTarget;
    expect(frame.visible).toBe(false);
  });
});
