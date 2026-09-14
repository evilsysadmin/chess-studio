import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_PLATFORM_LAYOUT,
  PAWN_SLUG_PLATFORM_META,
  createPawnSlugPlatforms,
} from './pawnSlugPlatforms.js';

function renderMeshes(root) {
  const meshes = [];
  root.traverse((node) => {
    if (node.isMesh) meshes.push(node);
  });
  return meshes;
}

describe('Pawn Slug platform visual batching', () => {
  it('renders desktop platforms as a small set of instanced batches', () => {
    const root = createPawnSlugPlatforms(new THREE.Group(), { coarse: false });
    const meshes = renderMeshes(root);
    const supportInstances = PAWN_SLUG_PLATFORM_LAYOUT
      .filter((platform) => platform.theme === 'timber' || platform.theme === 'steel')
      .length * 2;
    const expectedInstances = PAWN_SLUG_PLATFORM_LAYOUT.length * 4 + supportInstances;

    expect(meshes.length).toBeLessThanOrEqual(PAWN_SLUG_PLATFORM_META.desktopVisualBatchBudget);
    expect(meshes.every((mesh) => mesh instanceof THREE.InstancedMesh)).toBe(true);
    expect(meshes.every((mesh) => mesh.userData.pawnSlugPlatformBatch)).toBe(true);
    expect(root.userData.pawnSlugPlatformVisualBatches).toBe(meshes.length);
    expect(root.userData.pawnSlugPlatformVisualInstances).toBe(expectedInstances);
    expect(meshes.reduce((total, mesh) => total + mesh.count, 0)).toBe(expectedInstances);
    root.userData.dispose();
  });

  it('keeps coarse platforms to three static instances per platform and no support batches', () => {
    const root = createPawnSlugPlatforms(new THREE.Group(), { coarse: true });
    const meshes = renderMeshes(root);
    const expectedInstances = PAWN_SLUG_PLATFORM_LAYOUT.length * 3;

    expect(meshes.length).toBeLessThanOrEqual(PAWN_SLUG_PLATFORM_META.coarseVisualBatchBudget);
    expect(meshes.every((mesh) => mesh instanceof THREE.InstancedMesh)).toBe(true);
    expect(root.userData.pawnSlugPlatformVisualInstances).toBe(expectedInstances);
    expect(meshes.reduce((total, mesh) => total + mesh.count, 0)).toBe(expectedInstances);
    expect(meshes.some((mesh) => mesh.name.includes('supports'))).toBe(false);
    root.userData.dispose();
  });

  it('retains non-rendering per-platform markers for diagnostics and compatibility', () => {
    const root = createPawnSlugPlatforms(new THREE.Group(), { coarse: false });
    const markers = root.children.filter((node) => node.userData.pawnSlugBatchedPlatformMarker);

    expect(markers).toHaveLength(PAWN_SLUG_PLATFORM_LAYOUT.length);
    expect(markers.every((marker) => marker.children.some((child) => child.name.endsWith('-front-lip')))).toBe(true);
    expect(markers.every((marker) => marker.children.every((child) => !child.isMesh))).toBe(true);
    root.userData.dispose();
  });
});
