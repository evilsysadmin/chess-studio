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

  it('instances repeated static scenery while preserving semantic groups and materials', () => {
    const scene = new THREE.Scene();
    const { root, far } = createSlugEnvironment(scene);
    const expectedSingleBatches = [
      ['pawn-slug-crater-rocks-instanced', 55, true],
      ['pawn-slug-rubble-dark-instanced', 28, true],
      ['pawn-slug-rubble-light-instanced', 35, true],
      ['pawn-slug-wall-battlements-instanced', 127, true],
      ['pawn-slug-track-ruts-instanced', 4, false],
      ['pawn-slug-wall-segments-instanced', 17, true],
      ['pawn-slug-far-hills-dark-instanced', 8, false],
      ['pawn-slug-far-hills-light-instanced', 7, false],
    ];

    expect(PAWN_SLUG_ENVIRONMENT_META.staticBatching).toBe(PAWN_SLUG_STATIC_INSTANCE_VERSION);
    expect(PAWN_SLUG_ENVIRONMENT_META.staticBatchedInstances).toBe(313);
    expect(PAWN_SLUG_ENVIRONMENT_META.staticBatchDrawMeshes).toBe(16);
    expect(root.userData.pawnSlugStaticBatchedInstances).toBe(313);
    expect(root.userData.pawnSlugStaticBatchDrawMeshes).toBe(16);

    for (const [name, count, castsShadow] of expectedSingleBatches) {
      const batch = root.getObjectByName(name);
      expect(batch).toBeInstanceOf(THREE.InstancedMesh);
      expect(batch.count).toBe(count);
      expect(batch.castShadow).toBe(castsShadow);
      expect(batch.receiveShadow).toBe(true);
    }

    const towerBattlements = [];
    root.traverse((node) => {
      if (node.name === 'pawn-slug-tower-battlements-instanced') towerBattlements.push(node);
    });
    expect(towerBattlements).toHaveLength(8);
    expect(towerBattlements.every((batch) => batch instanceof THREE.InstancedMesh)).toBe(true);
    expect(towerBattlements.reduce((total, batch) => total + batch.count, 0)).toBe(32);
    expect(towerBattlements.every((batch) => batch.count === 4 && batch.castShadow && batch.receiveShadow)).toBe(true);
    expect(far.getObjectByName('pawn-slug-far-hills-dark-instanced')).toBeTruthy();
    expect(far.getObjectByName('pawn-slug-far-hills-light-instanced')).toBeTruthy();

    disposePawnSlugObject(root);
  });
});
