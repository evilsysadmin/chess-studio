import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FIRE_SPRITE_DEFAULTS, createFireSprites, disposeFireSprites, fireSpriteSeeds } from './fireSprites.js';
import { WAR_ROOM_V2_FIRE_ANCHORS, installWarRoomV2FireSprites, installWarRoomV3StoveFireSprites } from './WarRoomFireSprites.js';

describe('fireSprites', () => {
  it('seeds deterministically per salt inside the spread', () => {
    const a = fireSpriteSeeds(20, 4, 0.3, 0.05);
    expect(a).toEqual(fireSpriteSeeds(20, 4, 0.3, 0.05));
    expect(a).not.toEqual(fireSpriteSeeds(20, 5, 0.3, 0.05));
    for (const seed of a) expect(Math.abs(seed.x)).toBeLessThanOrEqual(0.3);
  });

  it('creates a self-driving Points and halves the count on coarse pointers', () => {
    const fine = createFireSprites({ base: [1, 2, 3] });
    const coarse = createFireSprites({ coarsePointer: true });
    expect(fine.isPoints).toBe(true);
    expect(fine.geometry.getAttribute('aSeed').count).toBe(FIRE_SPRITE_DEFAULTS.count);
    expect(coarse.geometry.getAttribute('aSeed').count).toBe(FIRE_SPRITE_DEFAULTS.count / 2);
    fine.onBeforeRender({ userData: { board3DMotionNowMs: 5000 }, domElement: { height: 700 } });
    expect(fine.material.uniforms.uTime.value).toBe(5);
    expect(fine.material.uniforms.uViewportH.value).toBe(700);
    expect(fine.material.uniforms.uBase.value.toArray()).toEqual([1, 2, 3]);
  });

  it('removes itself from its parent when disposed', () => {
    const parent = new THREE.Group();
    const points = createFireSprites();
    parent.add(points);
    disposeFireSprites(points);
    expect(parent.children).toHaveLength(0);
  });
});

describe('War Room fire sprites', () => {
  it('adds one plume per v2 hearth anchor and cleans up', () => {
    const root = new THREE.Group();
    for (const [index, { anchor }] of WAR_ROOM_V2_FIRE_ANCHORS.entries()) {
      const node = new THREE.Object3D();
      node.name = anchor;
      node.position.set(index ? 4.85 : -4.55, 1.92, -5.05);
      root.add(node);
    }
    const dispose = installWarRoomV2FireSprites(root, { reducedMotion: false });
    expect(root.children.filter((child) => child.isPoints)).toHaveLength(2);
    expect(root.userData.warRoomFireSprites).toBe(2);
    dispose();
    expect(root.children.filter((child) => child.isPoints)).toHaveLength(0);
  });

  it('stays static under reduced motion and without anchors', () => {
    expect(installWarRoomV2FireSprites(new THREE.Group(), { reducedMotion: true })).toBeTypeOf('function');
    const root = new THREE.Group();
    installWarRoomV2FireSprites(root, { reducedMotion: false })();
    expect(root.children).toHaveLength(0);
  });

  it('roots the v3 stove plume above its flame nodes', () => {
    const parent = new THREE.Group();
    const flames = [-5.5, -5.4].map((x, i) => {
      const flame = new THREE.Object3D();
      flame.position.set(x, 1.5 + i * 0.1, -3.8);
      parent.add(flame);
      return flame;
    });
    const dispose = installWarRoomV3StoveFireSprites(flames);
    const points = parent.children.find((child) => child.isPoints);
    expect(points.material.uniforms.uBase.value.y).toBeCloseTo(1.45, 2);
    dispose();
    expect(parent.children.some((child) => child.isPoints)).toBe(false);
  });
});
