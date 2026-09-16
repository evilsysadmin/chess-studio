import { describe, expect, it } from 'vitest';
import {
  CHRONICLES_FANTASY_ENEMY_BUILDERS,
  buildAshGoblin,
  buildBoneHound,
  buildCryptSpider,
  buildEmberWisp,
} from './chroniclesFantasyEnemyArt.js';

function inspect(builder) {
  const root = builder({ coarsePointer: false });
  const meshes = [];
  const materials = [];
  root.traverse((node) => {
    if (node.isMesh) meshes.push(node);
    const nodeMaterials = Array.isArray(node.material) ? node.material : [node.material];
    nodeMaterials.filter(Boolean).forEach((material) => materials.push(material));
  });
  return { root, meshes, materials };
}

describe('Chronicles fantasy enemy art', () => {
  it('exports one procedural builder for every Menagerie creature', () => {
    expect(Object.keys(CHRONICLES_FANTASY_ENEMY_BUILDERS).sort()).toEqual([
      'ash-goblin',
      'bone-hound',
      'crypt-spider',
      'ember-wisp',
    ]);
  });

  it.each([
    ['ash-goblin', buildAshGoblin, 8],
    ['crypt-spider', buildCryptSpider, 10],
    ['ember-wisp', buildEmberWisp, 5],
    ['bone-hound', buildBoneHound, 10],
  ])('%s has a distinct owned 3D silhouette', (id, builder, minimumMeshes) => {
    const { root, meshes, materials } = inspect(builder);
    expect(root.userData.chroniclesEnemyVisualId).toBe(id);
    expect(root.userData.chroniclesArtTier).toBe('fantasy-procedural-v1');
    expect(root.userData.chroniclesSilhouette).toBeTruthy();
    expect(meshes.length).toBeGreaterThanOrEqual(minimumMeshes);
    expect(new Set(meshes.map((mesh) => mesh.name)).size).toBe(meshes.length);
    expect(materials.length).toBeGreaterThan(0);
    expect(materials.every((material) => material.userData.chroniclesOwnedMaterial)).toBe(true);
  });

  it('keeps coarse-pointer variants cheaper without removing their identity', () => {
    const fine = inspect(buildCryptSpider);
    const coarse = inspect(() => buildCryptSpider({ coarsePointer: true }));
    expect(coarse.meshes.length).toBe(fine.meshes.length);
    expect(coarse.root.userData.chroniclesSilhouette).toBe(fine.root.userData.chroniclesSilhouette);
    const fineSegments = fine.meshes[0].geometry.parameters.widthSegments;
    const coarseSegments = coarse.meshes[0].geometry.parameters.widthSegments;
    expect(coarseSegments).toBeLessThan(fineSegments);
  });
});
