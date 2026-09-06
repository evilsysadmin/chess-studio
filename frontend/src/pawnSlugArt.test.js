import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  PAWN_SLUG_ENVIRONMENT_META,
  createSlugEnvironment,
  disposePawnSlugObject,
} from './pawnSlugArt.js';
import { PAWN_SLUG_STATIC_INSTANCE_VERSION } from './pawnSlugStaticInstances.js';

describe('Pawn Slug battlefield art contracts', () => {
  it('keeps the premium scenery layered and intentionally varied', () => {
    expect(PAWN_SLUG_ENVIRONMENT_META.theme).toBe('fortified-industrial-battlefield');
    expect(PAWN_SLUG_ENVIRONMENT_META.parallaxLayers).toBeGreaterThanOrEqual(3);
    expect(PAWN_SLUG_ENVIRONMENT_META.props).toEqual(expect.arrayContaining([
      'fortress-wall',
      'battlements',
      'searchlights',
      'sandbags',
      'anti-tank-hedgehogs',
      'shell-craters',
      'track-ruts',
      'smoke-plumes',
    ]));
  });

  it('builds named foreground and far-parallax battlefield layers without WebGL', () => {
    const scene = new THREE.Scene();
    const { root, far } = createSlugEnvironment(scene);

    expect(root.name).toBe('pawn-slug-environment');
    expect(far.name).toBe('pawn-slug-far-parallax');
    expect(scene.children).toContain(root);
    expect(root.children).toContain(far);
    expect(root.getObjectByName('pawn-slug-fortress-wall')).toBeTruthy();
    expect(root.getObjectByName('pawn-slug-fortress-tower')).toBeTruthy();
    expect(root.getObjectByName('pawn-slug-sandbag-nest')).toBeTruthy();
    expect(root.getObjectByName('pawn-slug-anti-tank-hedgehog')).toBeTruthy();
    expect(root.children.length).toBeGreaterThan(35);
    expect(far.children.length).toBeGreaterThan(10);

    disposePawnSlugObject(root);
  });

  it('instances the highest-volume static rubble without changing semantic scenery groups', () => {
    const scene = new THREE.Scene();
    const { root } = createSlugEnvironment(scene);
    const expectedBatches = [
      ['pawn-slug-crater-rocks-instanced', 55],
      ['pawn-slug-rubble-dark-instanced', 28],
      ['pawn-slug-rubble-light-instanced', 35],
      ['pawn-slug-wall-battlements-instanced', 127],
    ];

    expect(PAWN_SLUG_ENVIRONMENT_META.staticBatching).toBe(PAWN_SLUG_STATIC_INSTANCE_VERSION);
    expect(PAWN_SLUG_ENVIRONMENT_META.staticBatchedInstances).toBe(245);
    expect(PAWN_SLUG_ENVIRONMENT_META.staticBatchDrawMeshes).toBe(4);
    expect(root.userData.pawnSlugStaticBatchedInstances).toBe(245);
    expect(root.userData.pawnSlugStaticBatchDrawMeshes).toBe(4);

    for (const [name, count] of expectedBatches) {
      const batch = root.getObjectByName(name);
      expect(batch).toBeInstanceOf(THREE.InstancedMesh);
      expect(batch.count).toBe(count);
      expect(batch.castShadow).toBe(true);
      expect(batch.receiveShadow).toBe(true);
    }

    disposePawnSlugObject(root);
  });
});
