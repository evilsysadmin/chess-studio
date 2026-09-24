import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FIRE_SPRITE_DEFAULTS, STEAM_SPRITE_DEFAULTS, createFireSprites, createSteamSprites, disposeFireSprites, fireSpriteSeeds } from './fireSprites.js';
import { WAR_ROOM_V2_FIRE_ANCHORS, hideBakedHearthFlames, installWarRoomV2FireSprites, installWarRoomV3StoveFireSprites } from './WarRoomFireSprites.js';

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

describe('baked hearth flames', () => {
  const build = () => {
    const root = new THREE.Group();
    const anchor = new THREE.Object3D();
    anchor.name = 'WR_ANCHOR_fireplace_practical';
    anchor.position.set(-4.55, 1.92, -5.05);
    root.add(anchor);
    const mat = (name) => Object.assign(new THREE.MeshBasicMaterial(), { name });
    const single = new THREE.Mesh(new THREE.BoxGeometry(), mat('WR_MAT_fire'));
    single.position.set(-4.55, 1.36, -5.5);
    const mixed = new THREE.Mesh(new THREE.BoxGeometry(), [mat('WR_MAT_stone'), mat('WR_MAT_fire')]);
    mixed.position.set(-4.6, 1.5, -6);
    const chandelier = new THREE.Mesh(new THREE.BoxGeometry(), mat('WR_MAT_fire_core'));
    chandelier.position.set(-4.5, 6.7, -3);
    const farCandle = new THREE.Mesh(new THREE.BoxGeometry(), mat('WR_MAT_fire_core'));
    farCandle.position.set(2.9, 2.0, -5.7);
    root.add(single, mixed, chandelier, farCandle);
    return { root, anchor, single, mixed, chandelier, farCandle };
  };

  it('hides only the hearth flames and restores them', () => {
    const { root, anchor, single, mixed, chandelier, farCandle } = build();
    const original = mixed.material;
    const restore = hideBakedHearthFlames(root, [anchor]);
    expect(single.visible).toBe(false);
    expect(mixed.material[0].visible).toBe(true);
    expect(mixed.material[1].visible).toBe(false);
    expect(chandelier.visible).toBe(true);
    expect(farCandle.visible).toBe(true);
    restore();
    expect(single.visible).toBe(true);
    expect(mixed.material).toBe(original);
  });
});

describe('steam sprites', () => {
  it('builds a normal-blended, self-driving soft plume', () => {
    const steam = createSteamSprites({ base: [1, 1, -2] });
    expect(steam.isPoints).toBe(true);
    expect(steam.geometry.getAttribute('aSeed').count).toBe(STEAM_SPRITE_DEFAULTS.count);
    expect(steam.material.blending).toBe(THREE.NormalBlending);
    expect(steam.material.uniforms.uOpacity.value).toBeLessThanOrEqual(0.6);
    steam.onBeforeRender({ userData: { board3DMotionNowMs: 2000 }, domElement: { height: 800 } });
    expect(steam.material.uniforms.uTime.value).toBe(2);
    expect(steam.material.uniforms.uBase.value.toArray()).toEqual([1, 1, -2]);
  });
});
