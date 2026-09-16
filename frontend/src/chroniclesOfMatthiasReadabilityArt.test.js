import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CHRONICLES_TACTICS_CUTAWAY_HEIGHT,
  CHRONICLES_TACTICS_PARTY_READABILITY_SCALE,
  chroniclesTacticsNeedsInteriorCutaway,
  chroniclesTacticsWallCell,
  installChroniclesTacticsReadabilityArt,
} from './chroniclesOfMatthiasReadabilityArt.js';

function fixture() {
  const scene = new THREE.Scene();
  const dungeon = new THREE.Group();
  dungeon.name = 'chronicles-isometric-dungeon';
  scene.add(dungeon);

  const wall = new THREE.Mesh(new THREE.BoxGeometry(2.45, 2.65, 2.45));
  wall.name = 'chronicles-iso-wall-3-4';
  wall.position.set(0, 1.23, 2.45);
  dungeon.add(wall);

  const cap = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.12, 2.35));
  cap.position.set(0, 2.59, 2.45);
  dungeon.add(cap);

  const highTrim = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.075, 2.47));
  highTrim.position.set(0, 1.86, 2.45);
  dungeon.add(highTrim);

  const party = new THREE.Group();
  scene.add(party);
  const models = new Map();
  ['rook', 'matthias', 'bishop', 'knight'].forEach((id) => {
    const model = new THREE.Group();
    model.scale.setScalar(1);
    party.add(model);
    models.set(id, model);
  });
  return { scene, dungeon, wall, cap, highTrim, models };
}

describe('Chronicles Tactics battlefield readability art', () => {
  it('recognizes only authored interior wall cells for tactical cutaway', () => {
    expect(chroniclesTacticsWallCell('chronicles-iso-wall-3-4')).toEqual({ x: 3, y: 4 });
    expect(chroniclesTacticsWallCell('not-a-wall')).toBeNull();
    expect(chroniclesTacticsNeedsInteriorCutaway('chronicles-iso-wall-3-4')).toBe(true);
    expect(chroniclesTacticsNeedsInteriorCutaway('chronicles-iso-wall-0-4')).toBe(false);
    expect(chroniclesTacticsNeedsInteriorCutaway('chronicles-iso-wall-3-1')).toBe(false);
  });

  it('shrinks the party and turns interior full-height blocks into readable cover', () => {
    const { wall, cap, highTrim, models } = fixture();
    const art = installChroniclesTacticsReadabilityArt(models);

    expect(art.cutawayWalls).toBe(1);
    models.forEach((model) => expect(model.scale.x).toBeCloseTo(CHRONICLES_TACTICS_PARTY_READABILITY_SCALE, 6));
    expect(wall.scale.y * wall.geometry.parameters.height).toBeCloseTo(CHRONICLES_TACTICS_CUTAWAY_HEIGHT, 6);
    expect(cap.position.y).toBeLessThan(1.2);
    expect(highTrim.visible).toBe(false);
  });

  it('is idempotent when the scene-art orchestrator runs twice', () => {
    const { wall, models } = fixture();
    const first = installChroniclesTacticsReadabilityArt(models);
    const scaleAfterFirst = models.get('matthias').scale.x;
    const wallScaleAfterFirst = wall.scale.y;
    const second = installChroniclesTacticsReadabilityArt(models);

    expect(second.cutawayWalls).toBe(0);
    expect(models.get('matthias').scale.x).toBeCloseTo(scaleAfterFirst, 8);
    expect(wall.scale.y).toBeCloseTo(wallScaleAfterFirst, 8);
    expect(first.cutawayWalls).toBe(1);
  });
});
