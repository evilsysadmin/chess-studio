import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  createPawnSlugCastleDungeon,
  createPawnSlugFallenForest,
  createPawnSlugGambitRuins,
} from './pawnSlugScenarioRenderer.js';
import { PAWN_SLUG_SCENARIO_STATIC_BATCH_META } from './pawnSlugScenarioStaticBatches.js';

function staticBatches(root) {
  const result = [];
  root.traverse((node) => {
    if (node.userData?.pawnSlugScenarioStaticBatch) result.push(node);
  });
  return result;
}

describe('Pawn Slug scenario static batching', () => {
  it('collapses the repeated forest structure into three instanced draw batches', () => {
    const root = createPawnSlugFallenForest({ coarse: false });
    const batches = staticBatches(root);

    expect(batches).toHaveLength(3);
    expect(batches.every((batch) => batch instanceof THREE.InstancedMesh)).toBe(true);
    expect(root.userData.pawnSlugScenarioStaticInstances).toBe(30);
    expect(root.getObjectByName('pawn-slug-forest-trunk')?.isMesh).not.toBe(true);
    expect(root.getObjectByName('pawn-slug-forest-root')?.isMesh).not.toBe(true);

    const fireflies = root.getObjectByName('pawn-slug-forest-fireflies');
    expect(fireflies.children.some((child) => child.isMesh && !child.isInstancedMesh)).toBe(true);
  });

  it('collapses repeated ruin columns and slabs into four batches while keeping hero art separate', () => {
    const root = createPawnSlugGambitRuins({ coarse: false });
    const batches = staticBatches(root);

    expect(batches).toHaveLength(4);
    expect(root.userData.pawnSlugScenarioStaticInstances).toBe(34);
    expect(root.getObjectByName('pawn-slug-ruins-column')?.isMesh).not.toBe(true);
    expect(root.getObjectByName('pawn-slug-ruins-slab')?.isMesh).not.toBe(true);
    expect(root.getObjectByName('pawn-slug-ruins-broken-rook')).toBeTruthy();
    expect(root.getObjectByName('pawn-slug-ruins-dust')).toBeTruthy();
  });

  it('reduces the dungeon structural field to nine batches and preserves animated chain art', () => {
    const root = createPawnSlugCastleDungeon({ coarse: false });
    const batches = staticBatches(root);

    expect(batches).toHaveLength(9);
    expect(root.userData.pawnSlugScenarioStaticInstances).toBe(58);
    expect(root.getObjectByName('pawn-slug-dungeon-arch')).toBeTruthy();
    const chain = root.getObjectByName('pawn-slug-dungeon-chain');
    expect(chain).toBeInstanceOf(THREE.Mesh);
    expect(chain).not.toBeInstanceOf(THREE.InstancedMesh);
  });

  it('uses the leaner gate count on coarse without changing the batch topology', () => {
    const root = createPawnSlugCastleDungeon({ coarse: true });
    const batches = staticBatches(root);

    expect(batches).toHaveLength(9);
    expect(root.userData.pawnSlugScenarioStaticInstances).toBe(56);
    expect(root.getObjectByName('pawn-slug-dungeon-depth-shadow')).toBeFalsy();
  });

  it('documents that only static repeated structure is batched', () => {
    expect(PAWN_SLUG_SCENARIO_STATIC_BATCH_META.strategy).toBe('instanced-by-scenario-part');
    expect(PAWN_SLUG_SCENARIO_STATIC_BATCH_META.preservesHeroProps).toBe(true);
    expect(PAWN_SLUG_SCENARIO_STATIC_BATCH_META.preservesAmbientActors).toBe(true);
  });
});
