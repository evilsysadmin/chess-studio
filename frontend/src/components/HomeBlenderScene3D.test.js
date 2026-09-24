import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  HOME_BLENDER_RUNTIME_MIN_WIDTH,
  homeBlenderFireKind,
  homeBlenderSteamMotion,
  applyHomeBlenderPieceLift,
  homeBlenderProjectAnchors,
  HOME_BLENDER_BEACON_ANCHORS,
  homeBlenderFireMotion,
  rebaseFlameToPivot,
  homeBlenderFireFramePlan,
  homeBlenderGlowOpacity,
  flameHeightRange,
  applyFlameGradient,
  HOME_BLENDER_FLAME_GRADIENT,
  homeBlenderTimeOfDayLook,
  applyHomeBlenderMoonVisibility,
  HOME_BLENDER_TIME_OF_DAY,
  homeBlenderIsSoftwareRenderer,
  applyFlameLook,
  HOME_BLENDER_FLAME_LOOK,
  HOME_BLENDER_FIRE_MAX_RENDER_MS,
  HOME_BLENDER_FIRE_MIN_SAMPLES,
  HOME_BLENDER_FIRE_MAX_FRAME_GAP_MS,
  HOME_BLENDER_FIRE_MAX_INTERVAL_MS,
  homeBlenderPolicyNeedsFallback,
  homeBlenderRuntimePolicy,
  homeBlenderDustSeeds,
  homeBlenderDustPosition,
  HOME_BLENDER_DUST,
  homeBlenderMoonShaftPose,
  HOME_BLENDER_MOON_SHAFT,
  homeBlenderFireSeeds,
  homeBlenderFireHearthBases,
  HOME_BLENDER_FIRE_PARTICLES,
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
        expect(motion.light).toBeGreaterThan(0.72);
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
      expect(plan.intervalMs).toBeLessThanOrEqual(HOME_BLENDER_FIRE_MAX_INTERVAL_MS);
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

    it('slows the fire down instead of stopping it on a modest desktop CPU', () => {
      for (const renderCostMs of [30, 45, 60]) {
        const plan = homeBlenderFireFramePlan({ baseIntervalMs: 42, renderCostMs, frameGapMs: 20, samples: 30 });
        expect(plan.enabled).toBe(true);
        expect(plan.intervalMs).toBeGreaterThanOrEqual(renderCostMs * 3);
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

  describe('torch light flicker', () => {
    it('makes a candle or torch light waver within a restrained band', () => {
      let min = Infinity;
      let max = -Infinity;
      for (let timeMs = 0; timeMs < 60000; timeMs += 42) {
        const { light } = homeBlenderFireMotion({ timeMs, phase: 1.7, kind: 'candle' });
        min = Math.min(min, light);
        max = Math.max(max, light);
      }
      expect(min).toBeGreaterThan(0.72);
      expect(max).toBeLessThan(1.08);
      // It must visibly move, not sit near a constant.
      expect(max - min).toBeGreaterThan(0.12);
    });

    it('does not flicker two torches in step', () => {
      let agree = 0;
      let total = 0;
      for (let timeMs = 0; timeMs < 60000; timeMs += 250) {
        const a = homeBlenderFireMotion({ timeMs, phase: 0.6, kind: 'candle' }).light - 0.90;
        const b = homeBlenderFireMotion({ timeMs, phase: 3.9, kind: 'candle' }).light - 0.90;
        if (Math.sign(a) === Math.sign(b)) agree += 1;
        total += 1;
      }
      // Independent noise agrees about half the time, never always.
      expect(agree / total).toBeLessThan(0.8);
      expect(agree / total).toBeGreaterThan(0.2);
    });

    it('is smooth from one rendered frame to the next', () => {
      let previous = homeBlenderFireMotion({ timeMs: 0, phase: 2.2, kind: 'candle' }).light;
      for (let timeMs = 42; timeMs < 8000; timeMs += 42) {
        const current = homeBlenderFireMotion({ timeMs, phase: 2.2, kind: 'candle' }).light;
        expect(Math.abs(current - previous)).toBeLessThan(0.05);
        previous = current;
      }
    });
  });

  describe('time of day look', () => {
    const channel = (hex, shift) => (hex >> shift) & 0xff;

    it('has a look for every period and falls back to day', () => {
      for (const period of ['dawn', 'day', 'dusk', 'night']) {
        expect(HOME_BLENDER_TIME_OF_DAY[period]).toBeTruthy();
        expect(homeBlenderTimeOfDayLook(period)).toBe(HOME_BLENDER_TIME_OF_DAY[period]);
      }
      expect(homeBlenderTimeOfDayLook('midnight')).toBe(HOME_BLENDER_TIME_OF_DAY.day);
      expect(homeBlenderTimeOfDayLook(undefined)).toBe(HOME_BLENDER_TIME_OF_DAY.day);
    });

    it('makes the sun/moon key cool at night and warm-bright at noon', () => {
      const night = homeBlenderTimeOfDayLook('night').key;
      const day = homeBlenderTimeOfDayLook('day').key;
      expect(channel(night.color, 0)).toBeGreaterThan(channel(night.color, 16));
      expect(channel(day.color, 16)).toBeGreaterThan(channel(day.color, 0));
      expect(night.scale).toBeLessThan(day.scale);
    });

    it('gives the window fill more daylight at noon than at night', () => {
      expect(homeBlenderTimeOfDayLook('day').fill.scale)
        .toBeGreaterThan(homeBlenderTimeOfDayLook('dusk').fill.scale);
    });

    it('only shows the moon when the sky is not full daylight', () => {
      const moon = { name: 'HOME_PROP_window_moon', visible: true };
      const mare = { name: 'HOME_PROP_window_moon_mare_2', visible: true };
      const other = { name: 'HOME_PROP_table_top', visible: true };
      const root = { traverse: (fn) => [moon, mare, other].forEach(fn) };
      expect(applyHomeBlenderMoonVisibility(root, 'day')).toBe(2);
      expect([moon.visible, mare.visible, other.visible]).toEqual([false, false, true]);
      applyHomeBlenderMoonVisibility(root, 'night');
      expect([moon.visible, mare.visible, other.visible]).toEqual([true, true, true]);
    });
  });

  describe('flame gradient', () => {
    it('reads the vertical extent of a flame geometry', () => {
      const geometry = {
        computeBoundingBox() {},
        boundingBox: { min: { y: 0.1 }, max: { y: 0.7 } },
      };
      expect(flameHeightRange(geometry)).toEqual({ min: 0.1, max: 0.7 });
      expect(flameHeightRange(null)).toBeNull();
      expect(flameHeightRange({ computeBoundingBox() {}, boundingBox: { min: { y: 1 }, max: { y: 1 } } })).toBeNull();
    });

    it('makes the tip hotter (more green) than the base', () => {
      const { base, tip } = HOME_BLENDER_FLAME_GRADIENT;
      expect(tip[1]).toBeGreaterThan(base[1] * 1.3);
      expect(tip[2]).toBeLessThan(base[2]);
    });

    it('injects the gradient into the shader without dropping the emissive chunk', () => {
      const material = { needsUpdate: false };
      expect(applyFlameGradient(material, { min: 0, max: 1 })).toBe(true);
      const shader = {
        uniforms: {},
        vertexShader: '#include <common>\n#include <begin_vertex>',
        fragmentShader: '#include <common>\n#include <emissivemap_fragment>',
      };
      material.onBeforeCompile(shader);
      expect(shader.uniforms.uFlameMin.value).toBe(0);
      expect(shader.uniforms.uFlameMax.value).toBe(1);
      expect(shader.vertexShader).toContain('vFlameY = position.y');
      expect(shader.fragmentShader).toContain('#include <emissivemap_fragment>');
      expect(shader.fragmentShader).toContain('totalEmissiveRadiance = mix(');
      expect(material.customProgramCacheKey()).toBe('home-flame-gradient');
      expect(applyFlameGradient(material, null)).toBe(false);
    });
  });

  describe('flame glow', () => {
    it('follows the light flicker but stays inside a sane band', () => {
      expect(homeBlenderGlowOpacity(0.5, 1)).toBeCloseTo(0.5);
      expect(homeBlenderGlowOpacity(0.5, 0.9)).toBeCloseTo(0.45);
      expect(homeBlenderGlowOpacity(0.5, 0.1)).toBeCloseTo(0.25);
      expect(homeBlenderGlowOpacity(0.5, 9)).toBeCloseTo(0.7);
    });

    it('never leaves 0..1 and tolerates bad input', () => {
      expect(homeBlenderGlowOpacity(0.9, 1.4)).toBe(1);
      expect(homeBlenderGlowOpacity(0, 1)).toBe(0);
      expect(homeBlenderGlowOpacity(undefined, undefined)).toBe(0);
      expect(homeBlenderGlowOpacity(0.5, Number.NaN)).toBeCloseTo(0.25);
    });
  });
});

describe('HomeBlenderScene3D table candelabra and coffee steam', () => {
  it('drives every candelabra flame as an animated candle and the mug wisps as steam', () => {
    for (const idx of [0, 1, 2, 3, 4]) {
      expect(homeBlenderFireKind(`HOME_PROP_table_candelabra_candle_flame_${idx}`)).toBe('candle');
      expect(homeBlenderFireKind(`HOME_PROP_table_mug_steam_${idx}`)).toBe('steam');
    }
    expect(homeBlenderFireKind('HOME_PROP_table_candelabra_candle_3')).toBeNull();
    expect(homeBlenderFireKind('HOME_PROP_table_mug_body')).toBeNull();
  });

  it('loops steam wisps: fades in and out at the cup, rises, swells and stays bounded', () => {
    const height = 0.4;
    let peak = 0;
    for (let ms = 0; ms <= 12000; ms += 250) {
      const motion = homeBlenderSteamMotion({ timeMs: ms, phase: 1.3, height });
      expect(motion.opacity).toBeGreaterThanOrEqual(0);
      expect(motion.opacity).toBeLessThanOrEqual(0.30 + 1e-9);
      expect(motion.rise).toBeGreaterThanOrEqual(0);
      expect(motion.rise).toBeLessThanOrEqual(height * 0.55 + 1e-9);
      expect(motion.scaleXZ).toBeGreaterThanOrEqual(1.8);
      expect(motion.scaleXZ).toBeLessThanOrEqual(5.0 + 1e-9);
      peak = Math.max(peak, motion.opacity);
    }
    expect(peak).toBeGreaterThan(0.2);
    // A wisp is invisible when it is born at the rim.
    const born = homeBlenderSteamMotion({ timeMs: 0, phase: 0, height });
    expect(born.progress).toBe(0);
    expect(born.opacity).toBe(0);
  });

  it('keeps wisps out of phase and deterministic', () => {
    const a = homeBlenderSteamMotion({ timeMs: 3000, phase: 0.4 });
    const b = homeBlenderSteamMotion({ timeMs: 3000, phase: 3.9 });
    expect(a.progress).not.toBeCloseTo(b.progress, 2);
    expect(homeBlenderSteamMotion({ timeMs: 3000, phase: 0.4 })).toEqual(a);
  });
});

describe('HomeBlenderScene3D flame flutter shader', () => {
  const compile = (material) => {
    const shader = {
      uniforms: {},
      vertexShader: '#include <common>\nvoid main(){\n#include <begin_vertex>\n}',
      fragmentShader: '#include <common>\nvoid main(){\n#include <emissivemap_fragment>\n}',
    };
    material.onBeforeCompile(shader);
    return shader;
  };

  it('adds a tip-weighted vertex flutter with an advanceable clock when asked', () => {
    const material = new THREE.MeshStandardMaterial();
    expect(applyFlameGradient(material, { min: 0, max: 0.4 }, { amp: 0.15, phase: 1.2 })).toBe(true);
    const shader = compile(material);
    expect(shader.vertexShader).toContain('flameTip');
    expect(shader.vertexShader).toContain('uniform float uFlameTime');
    expect(shader.uniforms.uFlutterAmp.value).toBe(0.15);
    expect(shader.uniforms.uFlutterPhase.value).toBe(1.2);
    expect(material.userData.flameTime).toBe(shader.uniforms.uFlameTime);
    expect(material.customProgramCacheKey()).toBe('home-flame-gradient-flutter');
  });

  it('keeps the plain gradient program for flames without flutter', () => {
    const material = new THREE.MeshStandardMaterial();
    applyFlameGradient(material, { min: 0, max: 0.4 });
    const shader = compile(material);
    expect(shader.vertexShader).not.toContain('flameTip');
    expect(material.userData.flameTime).toBeUndefined();
    expect(material.customProgramCacheKey()).toBe('home-flame-gradient');
  });
});

describe('HomeBlenderScene3D beacon anchors', () => {
  const canonicalCamera = (aspect) => {
    const camera = new THREE.PerspectiveCamera(22.9, aspect, 0.1, 80);
    camera.position.set(0, 4.85, 16);
    camera.lookAt(0, 1.55, -2.3);
    return camera;
  };

  it('projects every destination into the canvas, left to right in room order', () => {
    const layout = homeBlenderProjectAnchors(canonicalCamera(1870 / 852));
    for (const id of Object.keys(HOME_BLENDER_BEACON_ANCHORS)) {
      expect(layout[id].x).toBeGreaterThan(0);
      expect(layout[id].x).toBeLessThan(1);
      expect(layout[id].y).toBeGreaterThan(0);
      expect(layout[id].y).toBeLessThan(1);
    }
    expect(layout.history.x).toBeLessThan(layout.tournament.x);
    expect(layout.tournament.x).toBeLessThan(layout.train.x);
    expect(layout.train.x).toBeLessThan(layout.combat.x);
    expect(layout.combat.x).toBeLessThan(layout.daily.x);
    expect(layout.daily.x).toBeLessThan(layout.dungeon.x);
    // The armour stands on the room's centre line, above the table.
    expect(layout.combat.x).toBeGreaterThan(0.5);
    expect(layout.combat.x).toBeLessThan(0.62);
    expect(layout.combat.y).toBeLessThan(layout.daily.y);
  });

  it('follows the canvas aspect: the field of view is vertical, so a wider stage pulls side beacons towards the centre', () => {
    const wide = homeBlenderProjectAnchors(canonicalCamera(2.6));
    const narrow = homeBlenderProjectAnchors(canonicalCamera(1.8));
    expect(wide.tournament.x).toBeGreaterThan(narrow.tournament.x);
    expect(wide.daily.x).toBeLessThan(narrow.daily.x);
    // Vertical position does not depend on the aspect.
    expect(wide.combat.y).toBeCloseTo(narrow.combat.y, 3);
  });

  it('returns null without a camera', () => {
    expect(homeBlenderProjectAnchors(null)).toBeNull();
  });
});

describe('HomeBlenderScene3D chess piece lift', () => {
  const mesh = (materialName) => {
    const material = new THREE.MeshStandardMaterial();
    material.name = materialName;
    return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  };

  it('warms the light and dark pieces but leaves the board squares and everything else alone', () => {
    const root = new THREE.Group();
    const light = mesh('HOME_MAT_piece_light');
    const lightAlt = mesh('HOME_MAT_piece_light_alt');
    const dark = mesh('HOME_MAT_piece_dark');
    const square = mesh('HOME_MAT_board_light');
    const wall = mesh('HOME_MAT_stone');
    root.add(light, lightAlt, dark, square, wall);
    expect(applyHomeBlenderPieceLift(root)).toBe(3);
    expect(light.material.emissive.getHex()).toBeGreaterThan(dark.material.emissive.getHex());
    expect(lightAlt.material.emissive.getHex()).toBe(light.material.emissive.getHex());
    expect(square.material.emissive.getHex()).toBe(0);
    expect(wall.material.emissive.getHex()).toBe(0);
  });

  it('is safe on an empty or missing scene', () => {
    expect(applyHomeBlenderPieceLift(null)).toBe(0);
    expect(applyHomeBlenderPieceLift(new THREE.Group())).toBe(0);
  });
});

describe('home dust motes', () => {
  it('seeds deterministically inside the light volume', () => {
    const a = homeBlenderDustSeeds();
    expect(a).toEqual(homeBlenderDustSeeds());
    expect(a).toHaveLength(HOME_BLENDER_DUST.count);
    for (const seed of a) {
      expect(seed.y).toBeGreaterThanOrEqual(HOME_BLENDER_DUST.yMin);
      expect(seed.y).toBeLessThanOrEqual(HOME_BLENDER_DUST.yMax);
    }
  });

  it('drifts slowly and wraps vertically', () => {
    const [seed] = homeBlenderDustSeeds(1);
    for (const t of [0, 5000, 90000, 1e7]) {
      const [x, y] = homeBlenderDustPosition(seed, t);
      expect(y).toBeGreaterThanOrEqual(HOME_BLENDER_DUST.yMin);
      expect(y).toBeLessThanOrEqual(HOME_BLENDER_DUST.yMax);
      expect(Math.abs(x - seed.x)).toBeLessThanOrEqual(0.23);
    }
  });
});

describe('home moon shaft', () => {
  it('points from the window down toward the floor', () => {
    const pose = homeBlenderMoonShaftPose();
    expect(pose.length).toBeGreaterThan(4);
    expect(pose.center.y).toBeLessThan(HOME_BLENDER_MOON_SHAFT.from[1]);
    expect(pose.center.y).toBeGreaterThan(HOME_BLENDER_MOON_SHAFT.to[1]);
  });
});

describe('home fire particles', () => {
  it('seeds deterministically and differently per hearth', () => {
    const left = homeBlenderFireSeeds(HOME_BLENDER_FIRE_PARTICLES.count, 1);
    expect(left).toEqual(homeBlenderFireSeeds(HOME_BLENDER_FIRE_PARTICLES.count, 1));
    expect(left).not.toEqual(homeBlenderFireSeeds(HOME_BLENDER_FIRE_PARTICLES.count, 2));
    expect(left).toHaveLength(HOME_BLENDER_FIRE_PARTICLES.count);
    for (const seed of left) expect(Math.abs(seed.x)).toBeLessThanOrEqual(HOME_BLENDER_FIRE_PARTICLES.spreadX);
  });

  it('finds one base per hearth from the flame nodes', () => {
    const mk = (x) => {
      const object = new THREE.Object3D();
      object.position.set(x, 0.5, -5.7);
      object.updateMatrixWorld(true);
      return object;
    };
    const bases = homeBlenderFireHearthBases([
      { hearth: 'left', kind: 'flame', object: mk(-6.2) },
      { hearth: 'left', kind: 'hot', object: mk(-6.1) },
      { hearth: 'right', kind: 'flame', object: mk(4.4) },
      { hearth: 'right', kind: 'candle', object: mk(9) },
    ]);
    expect(bases.map((b) => b.hearth)).toEqual(['left', 'right']);
    expect(bases[0].base[0]).toBeCloseTo(-6.15, 2);
    expect(bases[1].base[0]).toBeCloseTo(4.4, 2);
  });
});
