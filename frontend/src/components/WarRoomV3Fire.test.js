import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { installWarRoomV3FireAnimation, warRoomV3FireFrame } from './WarRoomV3Fire.js';

describe('War Room v3 authored stove fire', () => {
  it('produces a restrained deterministic flicker and a static reduced-motion frame', () => {
    const first = warRoomV3FireFrame({ elapsedMs: 840 });
    expect(first).toEqual(warRoomV3FireFrame({ elapsedMs: 840 }));
    expect(first.height).toBeGreaterThan(0.85);
    expect(first.height).toBeLessThan(1.15);
    expect(first.intensity).toBeGreaterThan(0.82);
    expect(first.intensity).toBeLessThan(1.18);
    expect(warRoomV3FireFrame({ elapsedMs: 840, reducedMotion: true })).toEqual({
      width: 1,
      height: 1,
      depth: 1,
      lift: 0,
      intensity: 1,
    });
  });

  it('keeps the immutable public sample independent across timestamps', () => {
    const old = warRoomV3FireFrame({ elapsedMs: 840, coarsePointer: true });
    expect(Object.isFrozen(old)).toBe(true);
    for (const elapsedMs of [0, 840, 1370, 8000, 80_000]) {
      for (const coarsePointer of [false, true]) {
        const sample = warRoomV3FireFrame({ elapsedMs, coarsePointer });
        const power = coarsePointer ? 0.62 : 1;
        const slow = Math.sin(elapsedMs * 0.0043);
        const flutter = Math.sin(elapsedMs * 0.0107 + 0.9);
        const lick = Math.sin(elapsedMs * 0.0231 + Math.sin(elapsedMs * 0.0019) * 1.7);
        expect(sample).toEqual({
          width: 1 + (flutter * 0.045 - lick * 0.022) * power,
          height: 1 + (slow * 0.075 + lick * 0.055) * power,
          depth: 1 - flutter * 0.026 * power,
          lift: (slow * 0.013 + lick * 0.009) * power,
          intensity: 1 + (slow * 0.065 + flutter * 0.055 + lick * 0.035) * power,
        });
        expect(Object.isFrozen(sample)).toBe(true);
      }
    }
    expect(old).toEqual(warRoomV3FireFrame({ elapsedMs: 840, coarsePointer: true }));
  });

  it('matches phase-shifted flame and practical values across repeated render ticks', () => {
    for (const coarsePointer of [false, true]) {
      const root = new THREE.Group();
      const names = ['WR3_ARM_hearth_flame_body', 'WR3_ARM_hearth_flame_0', 'WR3_ARM_hearth_flame_1'];
      const flames = names.map((name) => {
        const flame = new THREE.Mesh(new THREE.SphereGeometry(0.2), new THREE.MeshStandardMaterial());
        flame.name = name;
        root.add(flame);
        return flame;
      });
      const anchor = new THREE.Group();
      anchor.name = 'WR_ANCHOR_fireplace_practical';
      const practical = new THREE.PointLight(0xff8a38, 2.3);
      anchor.add(practical);
      root.add(anchor);
      const release = installWarRoomV3FireAnimation(root, { coarsePointer });
      for (const elapsedMs of [0, 840, 2170, 1250, 840]) {
        flames[0].onBeforeRender({ userData: { board3DMotionNowMs: elapsedMs } });
        flames.forEach((flame, index) => {
          if (index > 0) {
            // Previous PR removed these GLB nodes from rendering. Their
            // transforms no longer need CPU updates while sprites are active.
            expect(flame.visible).toBe(false);
            expect(flame.scale.toArray()).toEqual([1, 1, 1]);
            expect(flame.position.y).toBe(0);
            return;
          }
          const expected = warRoomV3FireFrame({ elapsedMs, coarsePointer });
          expect(flame.scale.x).toBeCloseTo(expected.width, 12);
          expect(flame.scale.y).toBeCloseTo(expected.height, 12);
          expect(flame.scale.z).toBeCloseTo(expected.depth, 12);
          expect(flame.position.y).toBeCloseTo(expected.lift, 12);
        });
        const intensity = warRoomV3FireFrame({ elapsedMs, coarsePointer }).intensity;
        expect(practical.intensity).toBeCloseTo(2.3 * intensity, 12);
      }
      release();
      expect(practical.intensity).toBe(2.3);
      expect(flames.every((flame) => flame.scale.equals(new THREE.Vector3(1, 1, 1)))).toBe(true);
    }
  });

  it('keeps all authored flame updates in reduced-motion without sprites', () => {
    const root = new THREE.Group();
    const names = [
      'WR3_ARM_hearth_flame_body',
      'WR3_ARM_hearth_flame_0',
      'WR3_ARM_hearth_flame_1',
    ];
    const flames = names.map((name) => {
      const flame = new THREE.Mesh(
        new THREE.SphereGeometry(0.2),
        new THREE.MeshStandardMaterial(),
      );
      flame.name = name;
      root.add(flame);
      return flame;
    });
    // Reduced-motion disables sprites: GLB flame meshes remain visible and
    // all must still consume the dimmer (not just the callback driver).
    root.userData.warRoomHansFireDimmer = {
      core: { visible: true, scale: new THREE.Vector3(0.7, 0.4, 0.7) },
      light: { intensity: 0.5 },
    };
    const release = installWarRoomV3FireAnimation(root, { reducedMotion: true });
    expect(root.getObjectByName('war-room-v3-stove-fire-sprites')).toBeUndefined();
    expect(flames.every((flame) => flame.visible)).toBe(true);
    flames[0].onBeforeRender({ userData: { board3DMotionNowMs: 840 } });
    flames.forEach((flame) => {
      expect(flame.scale.toArray()).toEqual([0.7, 0.4, 0.7]);
      expect(flame.position.y).toBe(0);
    });
    release();
    expect(flames.every((flame) => flame.scale.equals(new THREE.Vector3(1, 1, 1)))).toBe(true);
  });

  it('honors Hans cold-hearth zero scale instead of treating zero as a missing multiplier', () => {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ emissive: 0xff4b12 });
    material.emissiveIntensity = 1.4;
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.2), material);
    flame.name = 'WR3_ARM_hearth_flame_body';
    root.add(flame);

    const anchor = new THREE.Group();
    anchor.name = 'WR_ANCHOR_fireplace_practical';
    const practical = new THREE.PointLight(0xff8a38, 2.3);
    anchor.add(practical);
    root.add(anchor);

    root.userData.warRoomHansFireDimmer = {
      core: {
        visible: false,
        scale: new THREE.Vector3(0.42, 0, 0.42),
      },
      light: { intensity: 0.035 },
    };

    const release = installWarRoomV3FireAnimation(root);
    flame.onBeforeRender({ userData: { board3DMotionNowMs: 840 } });

    const sprites = root.getObjectByName('war-room-v3-stove-fire-sprites');
    expect(flame.scale.y).toBe(0);
    expect(practical.intensity).toBeLessThan(0.1);
    expect(sprites).toBeTruthy();
    expect(sprites.visible).toBe(false);
    expect(sprites.material.uniforms.uHeight.value).toBe(0);
    expect(sprites.material.uniforms.uOpacity.value).toBe(0);

    release();
  });

  it('animates preserved flame nodes and restores them on cleanup', () => {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ emissive: 0xff4b12 });
    material.emissiveIntensity = 1.4;
    for (const name of [
      'WR3_ARM_hearth_flame_body',
      'WR3_ARM_hearth_flame_0',
      'WR3_ARM_hearth_flame_1',
      'WR3_ARM_hearth_flame_2',
    ]) {
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.2), material);
      flame.name = name;
      root.add(flame);
    }
    const anchor = new THREE.Group();
    anchor.name = 'WR_ANCHOR_fireplace_practical';
    const practical = new THREE.PointLight(0xff8a38, 2.3);
    const practicalColor = practical.color.getHex();
    anchor.add(practical);
    root.add(anchor);

    const driver = root.getObjectByName('WR3_ARM_hearth_flame_body');
    const secondary = root.getObjectByName('WR3_ARM_hearth_flame_0');
    const initiallyVisible = secondary.visible;
    const release = installWarRoomV3FireAnimation(root);
    // The invisible authored meshes are not submitted as redundant draws;
    // the first mesh must stay live to drive all fire/Hans callbacks.
    expect(driver.visible).toBe(true);
    expect(secondary.visible).toBe(false);
    expect(driver.material.opacity).toBe(0);
    driver.onBeforeRender({ userData: { board3DMotionNowMs: 840 } });

    expect(driver.userData.warRoomV3FireDriver).toBe(true);
    expect(driver.scale.y).not.toBe(1);
    expect(practical.intensity).not.toBe(2.3);
    expect(root.userData.warRoomV3FireAnimation).toBe('authored-flicker-v2-hans-dimmer');

    release();
    expect(secondary.visible).toBe(initiallyVisible);
    expect(driver.scale.toArray()).toEqual([1, 1, 1]);
    expect(practical.intensity).toBe(2.3);
    expect(practical.color.getHex()).toBe(practicalColor);
    expect(driver.userData.warRoomV3FireDriver).toBeUndefined();
    expect(root.userData.warRoomV3FireAnimation).toBeUndefined();
  });
  it('retains previously hidden secondary flames on teardown and keeps reduced-motion authored fire', () => {
    const root = new THREE.Group();
    const names = ['WR3_ARM_hearth_flame_body', 'WR3_ARM_hearth_flame_0', 'WR3_ARM_hearth_flame_1'];
    const flames = names.map((name) => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.2), new THREE.MeshStandardMaterial());
      mesh.name = name;
      root.add(mesh);
      return mesh;
    });
    flames[1].visible = false;
    const originalMaterials = flames.map((flame) => flame.material);
    const release = installWarRoomV3FireAnimation(root);
    expect(flames.map((flame) => flame.visible)).toEqual([true, false, false]);
    expect(root.getObjectByName('war-room-v3-stove-fire-sprites')).toBeTruthy();
    release();
    expect(flames.map((flame) => flame.visible)).toEqual([true, false, true]);
    expect(flames.map((flame) => flame.material)).toEqual(originalMaterials);

    const releaseReduced = installWarRoomV3FireAnimation(root, { reducedMotion: true });
    expect(flames.map((flame) => flame.visible)).toEqual([true, false, true]);
    expect(root.getObjectByName('war-room-v3-stove-fire-sprites')).toBeUndefined();
    releaseReduced();
    expect(flames.map((flame) => flame.visible)).toEqual([true, false, true]);
  });

});
