import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  attachPawnSlugScenarioAmbience,
  createPawnSlugScenarioAmbience,
} from './pawnSlugScenarioAmbience.js';

function ambientFixture() {
  const root = new THREE.Group();

  const fireflies = new THREE.Group();
  fireflies.name = 'pawn-slug-forest-fireflies';
  fireflies.add(new THREE.Mesh(new THREE.SphereGeometry(0.1), new THREE.MeshBasicMaterial()));

  const dust = new THREE.Group();
  dust.name = 'pawn-slug-ruins-dust';
  dust.add(new THREE.Mesh(new THREE.SphereGeometry(0.1), new THREE.MeshBasicMaterial()));

  const chain = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02), new THREE.MeshBasicMaterial());
  chain.name = 'pawn-slug-dungeon-chain';

  root.add(fireflies, dust, chain);
  return { root, fireflies, dust, chain };
}

describe('Pawn Slug premium scenario ambience', () => {
  it('animates forest, ruins and dungeon ambience without touching gameplay state', () => {
    const { root, fireflies, dust, chain } = ambientFixture();
    const controller = createPawnSlugScenarioAmbience(root);
    const initial = {
      fireflyY: fireflies.position.y,
      dustX: dust.position.x,
      chainRz: chain.rotation.z,
    };

    expect(controller.counts).toEqual({ fireflies: 1, dust: 1, chains: 1 });
    expect(controller.enabled).toBe(true);
    controller.update(1.25);
    expect(fireflies.position.y).not.toBe(initial.fireflyY);
    expect(dust.position.x).not.toBe(initial.dustX);
    expect(chain.rotation.z).not.toBe(initial.chainRz);
  });

  it('restores captured transforms exactly', () => {
    const { root, fireflies, dust, chain } = ambientFixture();
    fireflies.position.set(1, 2, 3);
    dust.position.set(4, 5, 6);
    chain.rotation.z = 0.3;
    const controller = createPawnSlugScenarioAmbience(root);

    controller.update(3.5);
    controller.reset();
    expect(fireflies.position.toArray()).toEqual([1, 2, 3]);
    expect(dust.position.toArray()).toEqual([4, 5, 6]);
    expect(chain.rotation.z).toBeCloseTo(0.3);
  });

  it('is inert when reduced motion is requested', () => {
    const { root, fireflies, dust, chain } = ambientFixture();
    const controller = createPawnSlugScenarioAmbience(root, { reducedMotion: true });
    controller.update(10);
    expect(controller.enabled).toBe(false);
    expect(fireflies.position.y).toBe(0);
    expect(dust.position.x).toBe(0);
    expect(chain.rotation.z).toBe(0);
  });

  it('attaches render hooks only to ambient visual nodes', () => {
    const { root, fireflies, dust, chain } = ambientFixture();
    const controller = attachPawnSlugScenarioAmbience(root, { reducedMotion: false });
    const fireflyMesh = fireflies.children[0];
    const dustMesh = dust.children[0];

    expect(controller.enabled).toBe(true);
    expect(typeof fireflyMesh.onBeforeRender).toBe('function');
    expect(typeof dustMesh.onBeforeRender).toBe('function');
    expect(typeof chain.onBeforeRender).toBe('function');
  });
});
