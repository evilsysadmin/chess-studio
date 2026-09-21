import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  HOME_BLENDER_RUNTIME_MIN_WIDTH,
  homeBlenderFireKind,
  homeBlenderFireMotion,
  rebaseFlameToPivot,
  homeBlenderFireFramePlan,
  homeBlenderIsSoftwareRenderer,
  applyFlameLook,
  HOME_BLENDER_FLAME_LOOK,
  HOME_BLENDER_FIRE_MAX_RENDER_MS,
  HOME_BLENDER_FIRE_MIN_SAMPLES,
  HOME_BLENDER_FIRE_MAX_FRAME_GAP_MS,
  homeBlenderPolicyNeedsFallback,
  homeBlenderRuntimePolicy,
} from './HomeBlenderScene3D.jsx';

describe('HomeBlenderScene3D mobile runtime policy', () => {
  it('allows the canonical Blender Home from 360px on capable Android-class hardware', () => {
    expect(HOME_BLENDER_RUNTIME_MIN_WIDTH).toBe(360);

    for (const viewportWidth of [360, 390, 430, 768]) {
      expect(homeBlenderRuntimePolicy({
        viewportWidth,
        devicePixelRatio: 3,
        hardwareConcurrency: 8,
      })).toMatchObject({
        enabled: true,
        lod: 'lite',
        pixelRatio: 1.25,
        antialias: false,
        powerPreference: 'low-power',
      });
    }
  });

  it('keeps constrained phones on the existing fallback path', () => {
    expect(homeBlenderRuntimePolicy({
      viewportWidth: 390,
      devicePixelRatio: 3,
      hardwareConcurrency: 4,
    })).toMatchObject({ enabled: false, lod: 'lite' });

    expect(homeBlenderRuntimePolicy({
      viewportWidth: 430,
      devicePixelRatio: 2,
      hardwareConcurrency: 2,
    })).toMatchObject({ enabled: false, lod: '2d' });
  });

  it('preserves full-quality Blender rendering on roomy desktop hardware', () => {
    expect(homeBlenderRuntimePolicy({
      viewportWidth: 1440,
      devicePixelRatio: 2,
      hardwareConcurrency: 8,
    })).toMatchObject({
      enabled: true,
      lod: 'full',
      antialias: true,
      powerPreference: 'high-performance',
    });
  });
});


describe('HomeBlenderScene3D live fallback policy', () => {
  it('falls back when a resize/runtime policy disables 3D', () => {
    expect(homeBlenderPolicyNeedsFallback({ enabled: false, lod: 'lite' })).toBe(true);
    expect(homeBlenderPolicyNeedsFallback({ enabled: false, lod: '2d' })).toBe(true);
    expect(homeBlenderPolicyNeedsFallback({ enabled: true, lod: '2d' })).toBe(true);
  });

  it('keeps the Blender scene mounted while lite/full remain eligible', () => {
    expect(homeBlenderPolicyNeedsFallback({ enabled: true, lod: 'lite' })).toBe(false);
    expect(homeBlenderPolicyNeedsFallback({ enabled: true, lod: 'full' })).toBe(false);
  });
});


describe('HomeBlenderScene3D live flame animation', () => {
  it('classifies hearth, candle and wall-torch flames without touching unrelated props', () => {
    expect(homeBlenderFireKind('HOME_PROP_fireplace_left_front_flame_2')).toBe('flame');
    expect(homeBlenderFireKind('HOME_PROP_fireplace_right_front_hot_1')).toBe('hot');
    expect(homeBlenderFireKind('HOME_PROP_fireplace_left_front_tongue_0')).toBe('flame');
    expect(homeBlenderFireKind('HOME_PROP_fireplace_right_ember_bed')).toBe('ember');
    expect(homeBlenderFireKind('HOME_PROP_chandelier_flame_3')).toBe('candle');
    expect(homeBlenderFireKind('HOME_PROP_fireplace_right_mantel_flame_1')).toBe('candle');
    expect(homeBlenderFireKind('HOME_PROP_table_candle_flame')).toBe('candle');
    expect(homeBlenderFireKind('HOME_PROP_torch_flame_2')).toBe('candle');
    expect(homeBlenderFireKind('HOME_PROP_fireplace_left_log_a')).toBeNull();
  });

  it('keeps every live flame motion restrained around the authored silhouette', () => {
    for (const kind of ['flame', 'hot', 'ember', 'candle']) {
      for (let timeMs = 0; timeMs < 20000; timeMs += 137) {
        const motion = homeBlenderFireMotion({ timeMs, phase: 1.234, kind });
        expect(motion.scaleX).toBeGreaterThan(0.93);
        expect(motion.scaleX).toBeLessThan(1.07);
        expect(motion.scaleY).toBeGreaterThan(0.86);
        expect(motion.scaleY).toBeLessThan(1.16);
        expect(motion.scaleZ).toBeGreaterThan(0.93);
        expect(motion.scaleZ).toBeLessThan(1.07);
        expect(Math.abs(motion.lean)).toBeLessThan(0.09);
        expect(motion.emission).toBeGreaterThan(0.84);
        expect(motion.emission).toBeLessThan(1.10);
        expect(motion.light).toBeGreaterThan(0.84);
        expect(motion.light).toBeLessThan(1.12);
      }
    }
  });

  it('is deterministic for the same clock and phase', () => {
    const a = homeBlenderFireMotion({ timeMs: 4321, phase: 2.1, kind: 'flame' });
    const b = homeBlenderFireMotion({ timeMs: 4321, phase: 2.1, kind: 'flame' });
    expect(a).toEqual(b);
  });

  it('never settles into a loop and desynchronises separate flames', () => {
    const heights = [];
    for (let timeMs = 0; timeMs < 30000; timeMs += 250) {
      heights.push(homeBlenderFireMotion({ timeMs, phase: 0.7, kind: 'flame' }).scaleY);
    }
    // Sine mixes with a common period would repeat; noise must not.
    const firstHalf = heights.slice(0, 60).map((value) => value.toFixed(3)).join();
    const secondHalf = heights.slice(60, 120).map((value) => value.toFixed(3)).join();
    expect(firstHalf).not.toBe(secondHalf);
    expect(new Set(heights.map((value) => value.toFixed(3))).size).toBeGreaterThan(60);

    const one = homeBlenderFireMotion({ timeMs: 5000, phase: 0.7, kind: 'flame' });
    const two = homeBlenderFireMotion({ timeMs: 5000, phase: 3.9, kind: 'flame' });
    expect(one.scaleY).not.toBeCloseTo(two.scaleY, 3);
  });

  it('moves smoothly between rendered frames', () => {
    // 42 ms is the full-LOD frame interval; a flame must not pop between frames.
    for (const kind of ['flame', 'hot', 'ember', 'candle']) {
      let previous = homeBlenderFireMotion({ timeMs: 0, phase: 1.9, kind });
      for (let timeMs = 42; timeMs < 8000; timeMs += 42) {
        const current = homeBlenderFireMotion({ timeMs, phase: 1.9, kind });
        expect(Math.abs(current.scaleY - previous.scaleY)).toBeLessThan(0.06);
        expect(Math.abs(current.lean - previous.lean)).toBeLessThan(0.03);
        expect(Math.abs(current.emission - previous.emission)).toBeLessThan(0.06);
        previous = current;
      }
    }
  });

  it('shares one slow draught so a hearth leans together', () => {
    // Same clock, different flames: the shared gust term keeps their lean correlated.
    let agree = 0;
    let total = 0;
    for (let timeMs = 0; timeMs < 60000; timeMs += 500) {
      const a = homeBlenderFireMotion({ timeMs, phase: 0.4, kind: 'flame' }).lean;
      const b = homeBlenderFireMotion({ timeMs, phase: 4.4, kind: 'flame' }).lean;
      if (Math.sign(a) === Math.sign(b)) agree += 1;
      total += 1;
    }
    expect(agree / total).toBeGreaterThan(0.55);
  });

  describe('flame pivot', () => {
    const worldBox = (mesh) => {
      mesh.updateMatrixWorld(true);
      return new THREE.Box3().setFromObject(mesh);
    };
    const panel = (cx, base, height, width = 0.16, z = -6.04) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([
        cx - width, base, z, cx + width, base, z, cx, base + height, z,
      ], 3));
      return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    };

    it('reseats a world-origin flame on its base without moving it', () => {
      const mesh = panel(-6.15, 0.58, 0.7);
      const before = worldBox(mesh);
      expect(rebaseFlameToPivot(mesh)).toBe(true);
      const after = worldBox(mesh);
      expect(after.min.x).toBeCloseTo(before.min.x, 5);
      expect(after.max.x).toBeCloseTo(before.max.x, 5);
      expect(after.min.y).toBeCloseTo(before.min.y, 5);
      expect(after.max.y).toBeCloseTo(before.max.y, 5);
      expect(after.min.z).toBeCloseTo(before.min.z, 5);
      mesh.geometry.computeBoundingBox();
      expect(mesh.geometry.boundingBox.min.y).toBeCloseTo(0, 5);
      expect((mesh.geometry.boundingBox.min.x + mesh.geometry.boundingBox.max.x) / 2).toBeCloseTo(0, 5);
    });

    it('handles the non-uniform node transform the published scene really carries', () => {
      // Taken from the published home.scene.runtime: the flame nodes hold a global
      // scene scale/translation while their vertices stay far from the node origin.
      const mesh = panel(-6.69, 0.58, 0.38, 0.16, -5.585);
      mesh.scale.set(0.126, 0.063, 0.9);
      mesh.position.set(-0.615, 0.035, -1.01);
      const before = worldBox(mesh);
      expect(rebaseFlameToPivot(mesh)).toBe(true);
      const after = worldBox(mesh);
      for (const axis of ['x', 'y', 'z']) {
        expect(after.min[axis]).toBeCloseTo(before.min[axis], 5);
        expect(after.max[axis]).toBeCloseTo(before.max[axis], 5);
      }
      // Stretching about the new pivot must keep the flame's base where it was.
      const baseY = after.min.y;
      mesh.scale.set(0.126 * 0.96, 0.063 * 1.12, 0.9 * 0.96);
      expect(worldBox(mesh).min.y).toBeCloseTo(baseY, 5);
    });

    it('keeps the base fixed when the reseated flame is stretched and leaned', () => {
      const mesh = panel(4.45, 0.58, 0.56);
      const baseBefore = worldBox(mesh).min.y;
      rebaseFlameToPivot(mesh);
      mesh.scale.set(0.96, 1.12, 0.96);
      mesh.rotation.z = 0.06;
      const box = worldBox(mesh);
      expect(box.min.y).toBeGreaterThan(baseBefore - 0.03);
      expect(box.max.y - baseBefore).toBeGreaterThan(0.56);
      expect(Math.abs((box.min.x + box.max.x) / 2 - 4.45)).toBeLessThan(0.05);
    });

    it('leaves a flame that is already pivoted on its base untouched', () => {
      const mesh = panel(0, 0, 0.7, 0.16, 0);
      mesh.position.set(-6.15, 0.58, -6.04);
      const geometry = mesh.geometry;
      expect(rebaseFlameToPivot(mesh)).toBe(false);
      expect(mesh.geometry).toBe(geometry);
      expect(mesh.position.toArray()).toEqual([-6.15, 0.58, -6.04]);
    });
  });

  describe('fire frame budget', () => {
    it('keeps the base cadence while it has too few samples to judge', () => {
      expect(homeBlenderFireFramePlan({ baseIntervalMs: 42, renderCostMs: 500, samples: HOME_BLENDER_FIRE_MIN_SAMPLES - 1 }))
        .toEqual({ enabled: true, intervalMs: 42 });
    });

    it('keeps the base cadence on cheap frames', () => {
      for (const renderCostMs of [0, 1, 4, 9]) {
        expect(homeBlenderFireFramePlan({ baseIntervalMs: 42, renderCostMs, samples: 30 }))
          .toEqual({ enabled: true, intervalMs: 42 });
      }
    });

    it('stretches the interval so the fire never takes more than about a third of the thread', () => {
      const plan = homeBlenderFireFramePlan({ baseIntervalMs: 42, renderCostMs: 20, samples: 30 });
      expect(plan.enabled).toBe(true);
      expect(plan.intervalMs).toBe(60);
      expect(plan.intervalMs).toBeGreaterThanOrEqual(20 * 3);
    });

    it('caps the stretched interval', () => {
      const plan = homeBlenderFireFramePlan({
        baseIntervalMs: 42,
        renderCostMs: HOME_BLENDER_FIRE_MAX_RENDER_MS,
        samples: 30,
      });
      expect(plan.enabled).toBe(true);
      expect(plan.intervalMs).toBeLessThanOrEqual(250);
    });

    it('turns the fire off when animation frames arrive late even if render calls look cheap', () => {
      // WebGL rasterises in the GPU process: the render call returns fast while the
      // frame pacing collapses. That is the software-GL / weak-GPU case.
      const starved = homeBlenderFireFramePlan({
        baseIntervalMs: 42,
        renderCostMs: 2,
        frameGapMs: HOME_BLENDER_FIRE_MAX_FRAME_GAP_MS + 5,
        samples: 30,
      });
      expect(starved.enabled).toBe(false);
      for (const frameGapMs of [8, 16.7, 20, HOME_BLENDER_FIRE_MAX_FRAME_GAP_MS]) {
        expect(homeBlenderFireFramePlan({ baseIntervalMs: 42, renderCostMs: 2, frameGapMs, samples: 30 }).enabled)
          .toBe(true);
      }
    });

    it('turns the fire off on hardware that cannot afford it', () => {
      const plan = homeBlenderFireFramePlan({
        baseIntervalMs: 42,
        renderCostMs: HOME_BLENDER_FIRE_MAX_RENDER_MS + 1,
        samples: 30,
      });
      expect(plan.enabled).toBe(false);
    });
  });

  describe('software renderer detection', () => {
    it('recognises CPU rasterisers by name', () => {
      for (const name of [
        'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
        'llvmpipe (LLVM 15.0.7, 256 bits)',
        'Google SwiftShader',
        'Microsoft Basic Render Driver',
        'Mesa softpipe',
        'Software Rasterizer',
      ]) {
        expect(homeBlenderIsSoftwareRenderer(name)).toBe(true);
      }
    });

    it('lets real GPUs animate', () => {
      for (const name of [
        'ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Ti Laptop GPU (0x00002C19) Direct3D11 vs_5_0 ps_5_0, D3D11)',
        'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)',
        'Mali-G78',
        'Adreno (TM) 740',
        'Intel(R) Iris(R) Xe Graphics',
        '',
      ]) {
        expect(homeBlenderIsSoftwareRenderer(name)).toBe(false);
      }
    });
  });

  describe('flame look', () => {
    const lit = () => new THREE.MeshStandardMaterial({ color: 0x571a05, roughness: 0.18, metalness: 0.1, emissive: 0x050100, emissiveIntensity: 1 });

    it('removes the diffuse response so the hearth light cannot wash the flame out', () => {
      for (const kind of ['flame', 'hot', 'candle']) {
        const material = lit();
        expect(applyFlameLook(material, kind)).toBe(true);
        expect(Math.max(material.color.r, material.color.g, material.color.b)).toBeLessThan(0.05);
        expect(material.metalness).toBe(0);
        expect(material.roughness).toBe(1);
        // Tone mapping would desaturate the flame toward pink-white.
        expect(material.toneMapped).toBe(false);
      }
    });

    it('gives every flame kind its own orange-to-amber emission, never white', () => {
      for (const kind of ['flame', 'hot', 'candle']) {
        const material = lit();
        applyFlameLook(material, kind);
        expect(material.emissive.r).toBeGreaterThan(material.emissive.g);
        expect(material.emissive.g).toBeGreaterThan(material.emissive.b);
        expect(material.emissive.b).toBeLessThan(0.35);
        expect(material.emissiveIntensity).toBe(HOME_BLENDER_FLAME_LOOK[kind].intensity);
      }
      const outer = lit(); applyFlameLook(outer, 'flame');
      const core = lit(); applyFlameLook(core, 'hot');
      expect(core.emissive.g).toBeGreaterThan(outer.emissive.g);
    });

    it('leaves unknown kinds and missing materials alone', () => {
      expect(applyFlameLook(lit(), 'ember')).toBe(false);
      expect(applyFlameLook(null, 'flame')).toBe(false);
    });
  });
});
