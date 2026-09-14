import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createPawnSlugReactiveSetpieces } from './pawnSlugScenarioSetpieces.js';

function forestFixture() {
  const root = new THREE.Group();
  const forest = new THREE.Group();
  forest.name = 'pawn-slug-landmark-fallen-forest';
  forest.position.x = 10.5;
  root.add(forest);
  const controller = createPawnSlugReactiveSetpieces(root);
  const leaves = root.getObjectByName('pawn-slug-setpiece-forest-leaves');
  return { root, forest, controller, leaves };
}

describe('Pawn Slug reactive setpiece hot path', () => {
  it('retires a completed one-shot instead of mutating hidden art forever', () => {
    const { controller, leaves } = forestFixture();
    const firstLeaf = leaves.children[0];
    const material = firstLeaf.material;

    controller.update(18.7, 10);
    controller.update(18.7, 13);
    expect(leaves.visible).toBe(false);

    firstLeaf.position.x = 999;
    material.opacity = 0.123;
    controller.update(18.7, 20);
    controller.update(18.7, 30);

    expect(firstLeaf.position.x).toBe(999);
    expect(material.opacity).toBeCloseTo(0.123);
  });

  it('captures the static trigger position once instead of resolving world matrices every frame', () => {
    const { forest, controller, leaves } = forestFixture();
    forest.position.x = 1000;

    controller.update(18.7, 4);

    expect(leaves.visible).toBe(true);
  });

  it('reset re-arms a completed setpiece and restores authored visual state', () => {
    const { controller, leaves } = forestFixture();
    const firstLeaf = leaves.children[0];

    controller.update(18.7, 5);
    controller.update(18.7, 8);
    expect(leaves.visible).toBe(false);

    controller.reset();
    expect(leaves.visible).toBe(false);
    controller.update(18.7, 12);
    expect(leaves.visible).toBe(true);
    expect(firstLeaf.material.opacity).toBeCloseTo(0.86);
  });
});
