import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createPawnSlugPremiumLandmarks } from './pawnSlugLandmarks.js';
import { createPawnSlugReactiveSetpieces } from './pawnSlugScenarioSetpieces.js';

describe('Pawn Slug reactive scenario setpieces', () => {
  it('installs premium proximity setpieces across the biome arc including a distant ruins convoy', () => {
    const root = createPawnSlugPremiumLandmarks(new THREE.Group(), { coarse: false });
    expect(root.getObjectByName('pawn-slug-setpiece-forest-leaves')).toBeTruthy();
    expect(root.getObjectByName('pawn-slug-setpiece-ruins-debris')).toBeTruthy();
    expect(root.getObjectByName('pawn-slug-setpiece-ruins-convoy')).toBeTruthy();
    expect(root.getObjectByName('pawn-slug-setpiece-dungeon-rats')).toBeTruthy();
    expect(root.getObjectByName('pawn-slug-setpiece-fortress-alarm')).toBeTruthy();
    expect(root.userData.pawnSlugReactiveSetpieces.count).toBe(5);
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

  it('preserves authored opacity through trigger, fade and reset', () => {
    const root = new THREE.Group();
    const forest = new THREE.Group();
    forest.name = 'pawn-slug-landmark-fallen-forest';
    forest.position.x = 10.5;
    root.add(forest);
    const controller = createPawnSlugReactiveSetpieces(root);
    const leaves = root.getObjectByName('pawn-slug-setpiece-forest-leaves');
    const material = leaves.children[0].material;

    expect(material.opacity).toBeCloseTo(0.86);
    controller.update(18.7, 5);
    expect(material.opacity).toBeCloseTo(0.86);
    controller.update(18.7, 6.2);
    expect(material.opacity).toBeCloseTo(0.43, 2);
    controller.reset();
    expect(material.opacity).toBeCloseTo(0.86);
  });

  it('fades nested convoy and rat materials before hiding their groups', () => {
    const root = new THREE.Group();
    const ruins = new THREE.Group();
    ruins.name = 'pawn-slug-landmark-gambit-ruins';
    ruins.position.x = 30.5;
    root.add(ruins);
    const dungeon = new THREE.Group();
    dungeon.name = 'pawn-slug-landmark-dungeon-gate';
    dungeon.position.x = 44.5;
    root.add(dungeon);

    const controller = createPawnSlugReactiveSetpieces(root);
    const convoy = root.getObjectByName('pawn-slug-setpiece-ruins-convoy');
    const rats = root.getObjectByName('pawn-slug-setpiece-dungeon-rats');
    const convoyMaterial = convoy.children[0].children[0].material;
    const ratMaterial = rats.children[0].children[0].material;

    controller.update(38.7, 4);
    controller.update(48.7, 4);
    expect(convoyMaterial.opacity).toBeCloseTo(0.88);
    expect(ratMaterial.opacity).toBeCloseTo(0.95);

    controller.update(48.7, 5.2);
    expect(convoyMaterial.opacity).toBeCloseTo(0.44, 2);
    expect(ratMaterial.opacity).toBeCloseTo(0.475, 2);

    controller.reset();
    expect(convoyMaterial.opacity).toBeCloseTo(0.88);
    expect(ratMaterial.opacity).toBeCloseTo(0.95);
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

  it('sends a non-interactive convoy across the distant ruins background', () => {
    const root = new THREE.Group();
    const ruins = new THREE.Group();
    ruins.name = 'pawn-slug-landmark-gambit-ruins';
    ruins.position.x = 30.5;
    root.add(ruins);
    const controller = createPawnSlugReactiveSetpieces(root);
    const convoy = root.getObjectByName('pawn-slug-setpiece-ruins-convoy');
    expect(convoy.visible).toBe(false);
    expect(convoy.position.z).toBeLessThan(-1);
    expect(convoy.children).toHaveLength(3);
    expect(convoy.children.every((vehicle) => vehicle.userData.distantConvoyVehicle)).toBe(true);
    const startX = convoy.children[0].position.x;
    controller.update(38.7, 4);
    expect(convoy.visible).toBe(true);
    controller.update(38.7, 5);
    expect(convoy.children[0].position.x).toBeGreaterThan(startX);
    controller.update(38.7, 7);
    expect(convoy.visible).toBe(false);
  });

  it('warns of the fortress approach with a one-shot beacon and sparks', () => {
    const root = new THREE.Group();
    const fortress = new THREE.Group();
    fortress.name = 'pawn-slug-landmark-boss-fortress';
    fortress.position.x = 114.5;
    root.add(fortress);
    const controller = createPawnSlugReactiveSetpieces(root);
    const alarm = root.getObjectByName('pawn-slug-setpiece-fortress-alarm');
    expect(alarm.visible).toBe(false);
    controller.update(109.3, 20);
    expect(alarm.visible).toBe(true);
    const beacon = alarm.children.find((node) => node.userData.fortressBeacon);
    expect(beacon).toBeTruthy();
    controller.update(109.3, 20.5);
    expect(beacon.scale.x).not.toBe(1);
    controller.update(109.3, 23);
    expect(alarm.visible).toBe(false);
  });

  it('reset restores one-shot visual state for a clean restart', () => {
    const root = new THREE.Group();
    const fortress = new THREE.Group();
    fortress.name = 'pawn-slug-landmark-boss-fortress';
    fortress.position.x = 114.5;
    root.add(fortress);
    const controller = createPawnSlugReactiveSetpieces(root);
    const alarm = root.getObjectByName('pawn-slug-setpiece-fortress-alarm');
    controller.update(109.3, 5);
    controller.update(109.3, 5.5);
    controller.reset();
    expect(alarm.visible).toBe(false);
    for (const child of alarm.children) expect(child.scale.x).toBe(1);
    controller.update(109.3, 9);
    expect(alarm.visible).toBe(true);
  });

  it('is inert under reduced motion', () => {
    const root = new THREE.Group();
    for (const [name, x] of [
      ['pawn-slug-landmark-fallen-forest', 10.5],
      ['pawn-slug-landmark-gambit-ruins', 30.5],
      ['pawn-slug-landmark-dungeon-gate', 44.5],
      ['pawn-slug-landmark-boss-fortress', 114.5],
    ]) {
      const scenario = new THREE.Group();
      scenario.name = name;
      scenario.position.x = x;
      root.add(scenario);
    }
    const controller = createPawnSlugReactiveSetpieces(root, { reducedMotion: true });
    controller.update(110, 10);
    expect(controller.enabled).toBe(false);
    expect(root.children.flatMap((node) => node.children).every((node) => node.visible === false)).toBe(true);
  });
});
