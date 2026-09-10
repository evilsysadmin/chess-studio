import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createPawnSlugPremiumLandmarks } from './pawnSlugLandmarks.js';
import { createPawnSlugReactiveSetpieces } from './pawnSlugScenarioSetpieces.js';

describe('Pawn Slug reactive scenario setpieces', () => {
  it('installs one proximity setpiece in each premium biome', () => {
    const root = createPawnSlugPremiumLandmarks(new THREE.Group(), { coarse: false });
    expect(root.getObjectByName('pawn-slug-setpiece-forest-leaves')).toBeTruthy();
    expect(root.getObjectByName('pawn-slug-setpiece-ruins-debris')).toBeTruthy();
    expect(root.getObjectByName('pawn-slug-setpiece-dungeon-rats')).toBeTruthy();
    expect(root.userData.pawnSlugReactiveSetpieces.count).toBe(3);
  });

  it('keeps setpieces hidden until their scene position is approached', () => {
    const root = new THREE.Group();
    const forest = new THREE.Group();
    forest.name = 'pawn-slug-landmark-fallen-forest';
    forest.position.x = 10.5;
    root.add(forest);
    const controller = createPawnSlugReactiveSetpieces(root);
    const leaves = root.getObjectByName('pawn-slug-setpiece-forest-leaves');
    expect(leaves.visible).toBe(false);
    controller.update(0, 1);
    expect(leaves.visible).toBe(false);
    controller.update(18.7, 2);
    expect(leaves.visible).toBe(true);
  });

  it('runs a short one-shot reaction and hides it after the beat', () => {
    const root = new THREE.Group();
    const dungeon = new THREE.Group();
    dungeon.name = 'pawn-slug-landmark-dungeon-gate';
    dungeon.position.x = 44.5;
    root.add(dungeon);
    const controller = createPawnSlugReactiveSetpieces(root);
    const rats = root.getObjectByName('pawn-slug-setpiece-dungeon-rats');
    controller.update(48.7, 10);
    expect(rats.visible).toBe(true);
    const startX = rats.children[0].position.x;
    controller.update(48.7, 11);
    expect(rats.children[0].position.x).toBeGreaterThan(startX);
    controller.update(48.7, 13);
    expect(rats.visible).toBe(false);
  });

  it('is inert under reduced motion', () => {
    const root = new THREE.Group();
    for (const [name, x] of [
      ['pawn-slug-landmark-fallen-forest', 10.5],
      ['pawn-slug-landmark-gambit-ruins', 30.5],
      ['pawn-slug-landmark-dungeon-gate', 44.5],
    ]) {
      const scenario = new THREE.Group();
      scenario.name = name;
      scenario.position.x = x;
      root.add(scenario);
    }
    const controller = createPawnSlugReactiveSetpieces(root, { reducedMotion: true });
    controller.update(50, 10);
    expect(controller.enabled).toBe(false);
    expect(root.children.flatMap((node) => node.children).every((node) => node.visible === false)).toBe(true);
  });
});
