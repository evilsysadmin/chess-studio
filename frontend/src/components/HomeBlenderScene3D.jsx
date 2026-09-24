import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadHomeCastleR2Scene } from './HomeCastle3DR2Asset.js';
import {
  HOME_CASTLE_3D_MOBILE_ENABLE_MIN_WIDTH,
  homeCastle3DRenderPolicy,
} from './HomeCastle3DRenderPolicy.js';

export const HOME_BLENDER_RUNTIME_LOGICAL_ID = 'home.scene.runtime';
export const HOME_BLENDER_RUNTIME_MIN_WIDTH = HOME_CASTLE_3D_MOBILE_ENABLE_MIN_WIDTH;
export const HOME_BLENDER_CAMERA_FOV = 22.9;

const CAMERA_BASE = Object.freeze({ x: 0, y: 4.85, z: 16 });
const CAMERA_TARGET = Object.freeze({ x: 0, y: 1.55, z: -2.3 });

// Where each destination beacon floats, in the authored Blender frame (x right, y depth
// away from the camera, z up). The runtime scene is exported Y-up, so Blender (x, y, z)
// becomes three (x, z, -y). Beacons sit just above their object so they never hide it.
export const HOME_BLENDER_BEACON_ANCHORS = Object.freeze({
  tournament: Object.freeze([-6.15, 5.83, 3.45]), // trophy on the left chimney ledge
  train: Object.freeze([-2.65, 5.7, 2.75]), // library
  combat: Object.freeze([1.55, 5.83, 4.0]), // suit of armour, above the plume
  daily: Object.freeze([4.45, 5.8, 1.9]), // right hearth
  history: Object.freeze([-6.55, 2.33, 1.95]), // study corner: telescope, globe, kettle
  dungeon: Object.freeze([6.3, 2.2, 2.2]), // stairs down, right
});

// Projects the beacon anchors through the live camera into fractions (0..1) of the
// canvas, so a beacon stays on its object whatever the stage aspect ratio is.
export function homeBlenderProjectAnchors(camera, anchors = HOME_BLENDER_BEACON_ANCHORS) {
  if (!camera) return null;
  camera.updateMatrixWorld?.(true);
  const layout = {};
  for (const [id, [bx, by, bz]] of Object.entries(anchors)) {
    const point = new THREE.Vector3(bx, bz, -by).project(camera);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.z > 1) continue;
    layout[id] = {
      x: Math.round((point.x * 0.5 + 0.5) * 10000) / 10000,
      y: Math.round((1 - (point.y * 0.5 + 0.5)) * 10000) / 10000,
    };
  }
  return layout;
}


const EXPOSURE = Object.freeze({
  dawn: 1.27,
  day: 1.22,
  dusk: 1.26,
  night: 1.32,
});

// The room used to look the same at every hour (only the exposure moved, by 8%).
// Each period now tints and rebalances the daylight-side lights: the warm key that
// stands for the sun/moon, the cool fill that comes from the tall window on the
// right, the sky colour of the hemisphere and the ambient wash. Values multiply the
// authored intensities, and the fires are untouched, so the room keeps its hearth
// glow at night and simply gets more daylight at noon. The moon disc only shows when
// there is a night-ish sky.
export const HOME_BLENDER_TIME_OF_DAY = Object.freeze({
  dawn: Object.freeze({
    ambient: Object.freeze({ color: 0xb08a78, scale: 1.0 }),
    hemi: Object.freeze({ color: 0x9aa6c8, scale: 1.05 }),
    key: Object.freeze({ color: 0xffb48e, scale: 0.95 }),
    fill: Object.freeze({ color: 0xc79aa8, scale: 1.3 }),
    moon: true,
  }),
  day: Object.freeze({
    ambient: Object.freeze({ color: 0xa89684, scale: 1.15 }),
    hemi: Object.freeze({ color: 0xa9c0e0, scale: 1.3 }),
    key: Object.freeze({ color: 0xffdcb0, scale: 1.12 }),
    fill: Object.freeze({ color: 0x8fb2e6, scale: 1.7 }),
    moon: false,
  }),
  dusk: Object.freeze({
    ambient: Object.freeze({ color: 0x9b7460, scale: 0.95 }),
    hemi: Object.freeze({ color: 0x8a7ea8, scale: 1.0 }),
    key: Object.freeze({ color: 0xff9a5c, scale: 0.95 }),
    fill: Object.freeze({ color: 0x8a6a96, scale: 1.3 }),
    moon: true,
  }),
  night: Object.freeze({
    ambient: Object.freeze({ color: 0x707a9b, scale: 0.9 }),
    hemi: Object.freeze({ color: 0x4a5f96, scale: 1.0 }),
    key: Object.freeze({ color: 0x9fb2e0, scale: 0.7 }),
    fill: Object.freeze({ color: 0x5a7ec4, scale: 1.5 }),
    moon: true,
  }),
});

export function homeBlenderTimeOfDayLook(ambient = 'day') {
  return HOME_BLENDER_TIME_OF_DAY[ambient] || HOME_BLENDER_TIME_OF_DAY.day;
}

const HOME_BLENDER_MOON_NAME = /window_moon/i;

export function applyHomeBlenderMoonVisibility(root, ambient = 'day') {
  const visible = homeBlenderTimeOfDayLook(ambient).moon;
  let touched = 0;
  root?.traverse?.((object) => {
    if (!HOME_BLENDER_MOON_NAME.test(String(object.name || ''))) return;
    object.visible = visible;
    touched += 1;
  });
  return touched;
}

function stableFirePhase(name = '') {
  let hash = 2166136261;
  for (let index = 0; index < name.length; index += 1) {
    hash ^= name.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000) / 1000 * Math.PI * 2;
}

export function homeBlenderFireKind(name = '') {
  const normalized = String(name).toLowerCase();
  if (normalized.includes('home_prop_table_mug_steam')) return 'steam';
  if (
    normalized.includes('home_prop_chandelier_flame_')
    || normalized.includes('_mantel_flame_')
    || normalized.includes('_candle_flame')
    || normalized.includes('home_prop_torch_flame_')
  ) return 'candle';
  if (!normalized.includes('home_prop_fireplace_')) return null;
  if (normalized.includes('ember')) return 'ember';
  if (normalized.includes('_hot_') || normalized.endsWith('_hot')) return 'hot';
  if (
    normalized.includes('_flame_')
    || normalized.includes('_tongue_')
    || normalized.includes('_front_base_')
  ) return 'flame';
  return null;
}

// Fire never repeats: it is built from smooth value noise at a few unrelated
// rates instead of summed sines, so no flame settles into an audible loop.
function fireLattice(index, seed) {
  let hash = Math.imul(index | 0, 374761393) ^ Math.imul(seed | 0, 668265263);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

function fireNoise(seconds, rate, seed) {
  const t = seconds * rate;
  const cell = Math.floor(t);
  const fraction = t - cell;
  const eased = fraction * fraction * (3 - 2 * fraction);
  const value = fireLattice(cell, seed) * (1 - eased) + fireLattice(cell + 1, seed) * eased;
  return value * 2 - 1;
}

export function homeBlenderFireMotion({
  timeMs = 0,
  phase = 0,
  kind = 'flame',
} = {}) {
  const seconds = Math.max(0, Number(timeMs) || 0) / 1000;
  const seed = Math.floor(Math.abs(Number(phase) || 0) * 997) + 13;
  // One slow draught shared by every flame, so a hearth leans together.
  const gust = fireNoise(seconds, 0.33, 7);
  const body = (
    fireNoise(seconds, 4.4, seed) * 0.60
    + fireNoise(seconds, 7.3, seed + 101) * 0.28
    + fireNoise(seconds, 10.9, seed + 211) * 0.12
  );
  const drift = fireNoise(seconds, 0.9, seed + 307);
  const flick = fireNoise(seconds, 8.6, seed + 401);

  if (kind === 'candle') {
    return {
      scaleX: 1 - body * 0.030,
      scaleY: 1 + body * 0.070,
      scaleZ: 1 - body * 0.030,
      lean: fireNoise(seconds, 2.6, seed + 503) * 0.050 + gust * 0.015,
      emission: 0.95 + flick * 0.045,
      // A candle or torch flame throws a light that wavers with it.
      light: 0.90 + body * 0.09 + drift * 0.07,
    };
  }
  if (kind === 'ember') {
    // Embers breathe slowly instead of flickering.
    const glow = fireNoise(seconds, 1.6, seed + 601);
    return {
      scaleX: 1 + glow * 0.015,
      scaleY: 1 + glow * 0.012,
      scaleZ: 1 + glow * 0.015,
      lean: 0,
      emission: 0.93 + glow * 0.06 + flick * 0.02,
      light: 0.97 + glow * 0.03,
    };
  }

  const hot = kind === 'hot';
  const stretch = body * (hot ? 0.75 : 1) + drift * 0.30;
  return {
    scaleX: 1 - stretch * (hot ? 0.030 : 0.045),
    scaleY: 1 + stretch * (hot ? 0.070 : 0.105) + Math.max(0, body) * 0.02,
    scaleZ: 1 - stretch * (hot ? 0.030 : 0.045),
    lean: fireNoise(seconds, 3.4, seed + 503) * (hot ? 0.030 : 0.045) + gust * (hot ? 0.020 : 0.035),
    emission: 0.95 + flick * 0.05 + body * 0.035,
    light: 0.95 + body * 0.05 + flick * 0.03 + drift * 0.02,
  };
}

// Coffee steam: each wisp loops (fade in, rise, swell, sway, fade out) on its own
// phase so the cup never pulses in unison. `height` is the wisp's own height, so
// the motion scales with whatever size the GLB ships.
export function homeBlenderSteamMotion({ timeMs = 0, phase = 0, height = 0.4 } = {}) {
  const seconds = Math.max(0, Number(timeMs) || 0) / 1000;
  const offset = ((Number(phase) || 0) / (Math.PI * 2)) % 1;
  const period = 4.2 + offset * 1.6;
  const progress = ((seconds / period) + offset + 1) % 1;
  const envelope = Math.sin(Math.PI * progress) ** 1.25;
  return {
    progress,
    opacity: 0.30 * envelope,
    rise: progress * height * 0.55,
    swayX: Math.sin((seconds * 1.15) + (Number(phase) || 0)) * height * 0.055 * (0.4 + progress),
    swayZ: Math.cos((seconds * 0.9) + (Number(phase) || 0) * 1.7) * height * 0.035,
    // The authored wisp is a thin tube; it swells into a soft plume as it rises.
    scaleXZ: 1.8 + progress * 3.2,
    scaleY: 0.85 + progress * 0.30,
  };
}

// The published runtime GLB was exported with every flame panel's origin at the
// world origin (vertices carry the world position), so scaling or leaning it would
// swing it across the room. Seat the pivot on the flame's own base instead, and
// move the node by the same amount so nothing shifts. A GLB that is already
// pivoted on its base is left untouched.
export function rebaseFlameToPivot(object) {
  const source = object?.geometry;
  if (!source?.attributes?.position) return false;
  source.computeBoundingBox();
  const box = source.boundingBox;
  const pivot = new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2);
  if (pivot.lengthSq() < 0.02 * 0.02) return false;
  const geometry = source.clone();
  geometry.translate(-pivot.x, -pivot.y, -pivot.z);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  object.geometry = geometry;
  object.position.add(pivot.multiply(object.scale).applyQuaternion(object.quaternion));
  object.updateMatrixWorld?.(true);
  return true;
}

// Software rasterisers (SwiftShader, llvmpipe...) draw the whole room on the CPU, so
// re-rendering it for a flickering fire would starve the page. The render call
// itself returns quickly (the work happens in the GPU process), so the cost cannot
// be measured reliably from the main thread: recognise the renderer by name.
export function homeBlenderIsSoftwareRenderer(rendererName = '') {
  return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(String(rendererName));
}

function readRendererName(renderer) {
  try {
    const gl = renderer?.getContext?.();
    const info = gl?.getExtension?.('WEBGL_debug_renderer_info');
    return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) || '') : '';
  } catch {
    return '';
  }
}

// The fire re-renders the whole room every few frames, which is only worth it when
// a frame is cheap. Two signals decide that: how long the render call takes on the
// main thread, and how late requestAnimationFrame arrives. The second matters
// because WebGL rasterises in the GPU process, so with software GL or a weak GPU the
// render call returns quickly while frames still back up. Stretch the interval so
// the fire stays a small share of the thread, and stop it (leaving the authored
// still frame) only when a frame is truly unaffordable. The render call is mostly
// three.js CPU overhead for ~1200 meshes, so a desktop with a modest CPU (and a
// strong GPU) legitimately measures 30-60 ms: that must slow the fire down, not
// kill it. Only a CPU-throttled 2x laptop already crossed the old 24 ms limit.
export const HOME_BLENDER_FIRE_MIN_SAMPLES = 6;
export const HOME_BLENDER_FIRE_MAX_RENDER_MS = 80;
export const HOME_BLENDER_FIRE_MAX_FRAME_GAP_MS = 60;
export const HOME_BLENDER_FIRE_MAX_INTERVAL_MS = 400;
export const HOME_BLENDER_FIRE_WARMUP_FRAMES = 20;

export function homeBlenderFireFramePlan({
  baseIntervalMs = 42,
  renderCostMs = 0,
  frameGapMs = 0,
  samples = 0,
} = {}) {
  const cost = Math.max(0, Number(renderCostMs) || 0);
  const gap = Math.max(0, Number(frameGapMs) || 0);
  if (samples < HOME_BLENDER_FIRE_MIN_SAMPLES) {
    return { enabled: true, intervalMs: baseIntervalMs };
  }
  if (cost > HOME_BLENDER_FIRE_MAX_RENDER_MS || gap > HOME_BLENDER_FIRE_MAX_FRAME_GAP_MS) {
    return { enabled: false, intervalMs: baseIntervalMs };
  }
  return { enabled: true, intervalMs: Math.min(HOME_BLENDER_FIRE_MAX_INTERVAL_MS, Math.max(baseIntervalMs, cost * 3)) };
}

// The exported flame materials are dark orange *lit* surfaces with an almost zero
// emissive term, so the hearth point light sitting on top of them floods the
// panels, and AgX tone mapping then desaturates any bright value to pink-white.
// A flame is a light source: kill the diffuse response, give it its own orange or
// amber emission, and keep it out of tone mapping so it stays a saturated flame.
export const HOME_BLENDER_FLAME_LOOK = Object.freeze({
  flame: Object.freeze({ emissive: 0xff4a08, intensity: 1 }),
  hot: Object.freeze({ emissive: 0xff9a1e, intensity: 1 }),
  candle: Object.freeze({ emissive: 0xffa030, intensity: 1 }),
});

export function applyFlameLook(material, kind) {
  const look = HOME_BLENDER_FLAME_LOOK[kind];
  if (!look || !material) return false;
  material.color?.setRGB?.(0.015, 0.004, 0);
  material.emissive?.setHex?.(look.emissive);
  if ('emissiveIntensity' in material) material.emissiveIntensity = look.intensity;
  if ('roughness' in material) material.roughness = 1;
  if ('metalness' in material) material.metalness = 0;
  material.toneMapped = false;
  material.needsUpdate = true;
  return true;
}

// Flat orange emission makes every flame a cut-out blob. Real flames are darker and
// redder at the base and yellow-white at the tip, so the emission is graded along the
// flame's own height (object-space y between the geometry bounds). The base value is
// a multiplier on the authored orange and the tip a hot yellow scaled by the same
// intensity, so the animated emissiveIntensity keeps driving the flicker.
export const HOME_BLENDER_FLAME_GRADIENT = Object.freeze({
  base: Object.freeze([0.95, 0.40, 0.28]),
  tip: Object.freeze([1.0, 0.60, 0.10]),
  from: 0.25,
  to: 1.0,
});

export function flameHeightRange(geometry) {
  if (!geometry) return null;
  geometry.computeBoundingBox?.();
  const box = geometry.boundingBox;
  if (!box) return null;
  const min = box.min.y;
  const max = box.max.y;
  return max - min > 1e-5 ? { min, max } : null;
}

// Rigid scale-and-lean made every flame read as a solid cut-out. With `flutter`, the
// vertex shader also waves the flame the way a real one moves: the base stays put and
// the tip whips sideways (with the tip weighted by height squared), on a few unrelated
// frequencies per flame. `material.userData.flameTime` is the uniform to advance.
export function applyFlameGradient(material, range, flutter = null) {
  if (!material || !range) return false;
  const { base, tip, from, to } = HOME_BLENDER_FLAME_GRADIENT;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFlameMin = { value: range.min };
    shader.uniforms.uFlameMax = { value: range.max };
    let vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vFlameY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlameY = position.y;');
    if (flutter) {
      shader.uniforms.uFlameTime = { value: 0 };
      shader.uniforms.uFlutterAmp = { value: flutter.amp };
      shader.uniforms.uFlutterPhase = { value: flutter.phase };
      material.userData.flameTime = shader.uniforms.uFlameTime;
      vertexShader = vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float uFlameMin;\nuniform float uFlameMax;\nuniform float uFlameTime;\nuniform float uFlutterAmp;\nuniform float uFlutterPhase;',
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float flameH = max(uFlameMax - uFlameMin, 1e-4);
          float flameLift = clamp((position.y - uFlameMin) / flameH, 0.0, 1.0);
          float flameTip = flameLift * flameLift;
          float wA = sin(uFlameTime * 3.3 + uFlutterPhase + flameLift * 5.0);
          float wB = sin(uFlameTime * 5.9 + uFlutterPhase * 1.7 + flameLift * 9.0 + position.x * 7.0);
          float wC = sin(uFlameTime * 1.7 + uFlutterPhase * 0.6);
          transformed.x += (wA * 0.55 + wB * 0.25 + wC * 0.40) * uFlutterAmp * flameH * flameTip;
          transformed.z += (wB * 0.40 + wA * 0.20 - wC * 0.30) * uFlutterAmp * flameH * flameTip;
          transformed.y -= abs(wA * wB) * 0.06 * flameH * flameTip;`,
        );
    }
    shader.vertexShader = vertexShader;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying float vFlameY;\nuniform float uFlameMin;\nuniform float uFlameMax;',
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float flameT = smoothstep(${from.toFixed(2)}, ${to.toFixed(2)},
          clamp((vFlameY - uFlameMin) / max(uFlameMax - uFlameMin, 1e-4), 0.0, 1.0));
        float flameGain = max(max(emissive.r, emissive.g), emissive.b);
        totalEmissiveRadiance = mix(
          totalEmissiveRadiance * vec3(${base.map((v) => v.toFixed(2)).join(',')}),
          vec3(${tip.map((v) => v.toFixed(2)).join(',')}) * flameGain,
          flameT);`,
      );
  };
  material.customProgramCacheKey = () => (flutter ? 'home-flame-gradient-flutter' : 'home-flame-gradient');
  material.needsUpdate = true;
  return true;
}

function prepareRuntimeFireRig(root) {
  const nodes = [];
  root?.traverse?.((object) => {
    if (!object?.isMesh) return;
    const kind = homeBlenderFireKind(object.name);
    if (!kind) return;
    object.castShadow = false;
    if (kind === 'flame' || kind === 'hot' || kind === 'steam') rebaseFlameToPivot(object);

    if (Array.isArray(object.material)) {
      object.material = object.material.map((material) => material?.clone?.() || material);
    } else if (object.material?.clone) {
      object.material = object.material.clone();
    }

    for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
      if (kind === 'steam') {
        material.transparent = true;
        material.depthWrite = false;
        material.opacity = 0;
        material.needsUpdate = true;
        continue;
      }
      if (kind !== 'ember') applyFlameLook(material, kind);
      if (kind !== 'ember') {
        applyFlameGradient(material, flameHeightRange(object.geometry), {
          amp: kind === 'candle' ? 0.055 : 0.15,
          phase: stableFirePhase(object.name),
        });
      }
    }

    const materials = (Array.isArray(object.material) ? object.material : [object.material])
      .filter(Boolean)
      .map((material) => ({
        material,
        emissiveIntensity: Number(material.emissiveIntensity) || 0,
      }));

    const lowered = object.name.toLowerCase();
    object.geometry?.computeBoundingBox?.();
    const wispBox = object.geometry?.boundingBox;
    nodes.push({
      object,
      kind,
      basePosition: object.position.clone(),
      height: wispBox ? Math.max(0.05, wispBox.max.y - wispBox.min.y) : 0.4,
      hearth: lowered.includes('fireplace_left') ? 'left' : lowered.includes('fireplace_right') ? 'right' : null,
      phase: stableFirePhase(object.name),
      baseScale: object.scale.clone(),
      baseRotationZ: object.rotation.z,
      materials,
    });
  });
  return nodes;
}

function applyRuntimeFireMotion(nodes, timeMs) {
  const light = { left: { sum: 0, count: 0 }, right: { sum: 0, count: 0 } };
  for (const node of nodes) {
    if (node.kind === 'steam') {
      const steam = homeBlenderSteamMotion({ timeMs, phase: node.phase, height: node.height });
      node.object.position.set(
        node.basePosition.x + steam.swayX,
        node.basePosition.y + steam.rise,
        node.basePosition.z + steam.swayZ,
      );
      node.object.scale.set(
        node.baseScale.x * steam.scaleXZ,
        node.baseScale.y * steam.scaleY,
        node.baseScale.z * steam.scaleXZ,
      );
      for (const { material } of node.materials) material.opacity = steam.opacity;
      continue;
    }
    const motion = homeBlenderFireMotion({
      timeMs,
      phase: node.phase,
      kind: node.kind,
    });
    node.object.scale.set(
      node.baseScale.x * motion.scaleX,
      node.baseScale.y * motion.scaleY,
      node.baseScale.z * motion.scaleZ,
    );
    node.object.rotation.z = node.baseRotationZ + motion.lean;
    const seconds = timeMs / 1000;
    for (const { material } of node.materials) {
      if (material.userData?.flameTime) material.userData.flameTime.value = seconds;
    }
    for (const { material, emissiveIntensity } of node.materials) {
      if ('emissiveIntensity' in material) {
        material.emissiveIntensity = emissiveIntensity * motion.emission;
      }
    }
    if ((node.kind === 'flame' || node.kind === 'hot') && light[node.hearth]) {
      light[node.hearth].sum += motion.light - 1;
      light[node.hearth].count += 1;
    }
  }
  // Each hearth throws its own light, driven by the mean of its own flames.
  // The mean of ~10 independent flames cancels most of its own swing, so amplify what is left.
  const factor = ({ sum, count }) => THREE.MathUtils.clamp(1 + (count ? sum / count : 0) * 3.4, 0.80, 1.18);
  return { left: factor(light.left), right: factor(light.right) };
}


const HOME_BLENDER_PORTRAIT_HORIZONTAL_FOV = 18.5;

export function homeBlenderCameraFovForAspect(aspect = 16 / 9) {
  const safeAspect = Number.isFinite(Number(aspect)) && Number(aspect) > 0
    ? Number(aspect)
    : 16 / 9;
  if (safeAspect >= 1) return HOME_BLENDER_CAMERA_FOV;

  const horizontalRadians = HOME_BLENDER_PORTRAIT_HORIZONTAL_FOV * Math.PI / 180;
  const portraitVerticalFov = 2 * Math.atan(
    Math.tan(horizontalRadians / 2) / safeAspect,
  ) * 180 / Math.PI;
  const blend = Math.min(1, Math.max(0, (1 - safeAspect) / 0.20));
  return Math.min(
    42,
    Math.max(
      HOME_BLENDER_CAMERA_FOV,
      HOME_BLENDER_CAMERA_FOV
        + (portraitVerticalFov - HOME_BLENDER_CAMERA_FOV) * blend,
    ),
  );
}

export function homeBlenderRuntimePolicy({
  viewportWidth = 0,
  devicePixelRatio = 1,
  hardwareConcurrency = 4,
} = {}) {
  return homeCastle3DRenderPolicy({
    viewportWidth,
    devicePixelRatio,
    hardwareConcurrency,
  });
}

function browserPolicy() {
  if (typeof window === 'undefined') {
    return homeBlenderRuntimePolicy();
  }
  return homeBlenderRuntimePolicy({
    viewportWidth: window.innerWidth,
    devicePixelRatio: window.devicePixelRatio || 1,
    hardwareConcurrency: typeof navigator !== 'undefined'
      ? (navigator.hardwareConcurrency || 4)
      : 4,
  });
}

export function homeBlenderRuntimeEligible() {
  if (typeof window === 'undefined') return false;
  const policy = browserPolicy();
  return window.innerWidth >= HOME_BLENDER_RUNTIME_MIN_WIDTH
    && policy.enabled
    && policy.lod !== '2d';
}

export function homeBlenderPolicyNeedsFallback(policy) {
  return !policy?.enabled || policy?.lod === '2d';
}


// Wall-torch x positions from the authored Blender scene (Blender x maps to three x).
const HOME_BLENDER_TORCH_X = Object.freeze([-8.0, -4.15, 2.45, 7.95]);

// The lite LOD lacks IBL, torch lights and shadows; lift what it does have.
const HOME_BLENDER_LITE_EXPOSURE_BOOST = 1.75;
const HOME_BLENDER_LITE_AMBIENT_BOOST = 2.6;

// Flames and candles were a bright shape with a hard edge and no halo, so they read
// as stickers. Each practical light now carries a soft additive sprite (a radial
// gradient, no post-processing pass) whose opacity follows the same flicker as the
// light behind it. The ratio is clamped so a deep dip in the noise never blacks the
// glow out and a spike never blows it out.
export function homeBlenderGlowOpacity(base = 0, lightRatio = 1) {
  const ratio = Math.min(1.4, Math.max(0.5, Number(lightRatio) || 0));
  return Math.min(1, Math.max(0, Number(base) * ratio));
}

function createGlowTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.14)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createGlowSprite(texture, color, size, opacity, position) {
  const material = new THREE.SpriteMaterial({
    map: texture,
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.position.copy(position);
  sprite.scale.set(size, size, 1);
  sprite.renderOrder = 5;
  return sprite;
}

function addRuntimeLights(scene, shadowsEnabled = true, ambientPeriod = 'day') {
  // Keep the browser rendition close to the authored Blender beauty pass:
  // dark stone stays dark and the warm practicals shape the room instead of
  // a large ambient wash flattening every material.
  const lift = shadowsEnabled ? 1 : HOME_BLENDER_LITE_AMBIENT_BOOST;
  const ambient = new THREE.AmbientLight(0x9b806b, 0.20 * lift);
  const hemi = new THREE.HemisphereLight(0x8198b8, 0x2a1208, 0.36 * lift);

  const key = new THREE.DirectionalLight(0xffc18a, 1.62);
  key.position.set(-5.2, 7.4, 8.2);
  key.castShadow = shadowsEnabled;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -9;
  key.shadow.camera.right = 9;
  key.shadow.camera.top = 8;
  key.shadow.camera.bottom = -3;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 28;
  key.shadow.bias = -0.00014;
  key.shadow.normalBias = 0.016;
  key.shadow.radius = 1.8;
  key.shadow.intensity = 0.72;

  const fill = new THREE.DirectionalLight(0x587aa8, 0.31);
  fill.position.set(7.2, 4.8, 5.6);

  const leftHearth = new THREE.PointLight(0xff6f24, 26, 8.5, 2);
  leftHearth.position.set(-6.15, 0.95, -5.12);

  const rightHearth = new THREE.PointLight(0xff6b21, 27, 8.5, 2);
  rightHearth.position.set(4.50, 1.10, -5.00);

  const table = new THREE.PointLight(0xffb66f, 3.35, 7.4, 2);
  table.position.set(0, 4.9, 3.8);

  const floorBounce = new THREE.PointLight(0xff8b45, 2.15, 8.8, 2);
  floorBounce.position.set(0, 0.55, -1.6);

  // The authored Blender scene lights the armour with dedicated rim and front
  // lights; the runtime had none, so the dark steel read as a black silhouette.
  // A narrow, soft-edged cool spot aimed at the suit lets its plates catch a
  // highlight without spilling onto the board, whose colours must stay honest.
  const look = homeBlenderTimeOfDayLook(ambientPeriod);
  ambient.color.setHex(look.ambient.color);
  ambient.intensity *= look.ambient.scale;
  hemi.color.setHex(look.hemi.color);
  hemi.intensity *= look.hemi.scale;
  key.color.setHex(look.key.color);
  key.intensity *= look.key.scale;
  fill.color.setHex(look.fill.color);
  fill.intensity *= look.fill.scale;

  const armour = new THREE.SpotLight(0xb9c6da, 26, 6, 0.36, 0.75, 2);
  armour.position.set(1.4, 3.6, -3.4);
  armour.target.position.set(1.5, 2.2, -5.7);
  armour.castShadow = false;

  // The four wall torches carry a point light in the Blender scene but had none in
  // the runtime, so they were bright flames that lit nothing around them. Full LOD
  // only: every extra light is paid by every material.
  const torches = shadowsEnabled
    ? HOME_BLENDER_TORCH_X.map((x) => {
      const light = new THREE.PointLight(0xff8a3c, 7, 6, 2);
      light.position.set(x, 3.15, -5.5);
      light.userData.glow = { size: 1.05, opacity: 0.5 };
      return light;
    })
    : [];
  // The Dungeon's two fire pits sit under the gate at the foot of the stairs and glow
  // up the steps in the Blender scene; the runtime ignored them, so the stairs read as
  // flat dark slabs. A warm light from below gives them relief and life, and it wavers
  // with the torches. Full LOD only, like them.
  if (shadowsEnabled) {
    const dungeon = new THREE.PointLight(0xff5a18, 9, 6, 2);
    dungeon.position.set(6.42, -0.45, -1.05);
    torches.push(dungeon);

    // Three more flames that light the Blender scene but not the runtime: the eight
    // candles of the chandelier (one light at their centre), the candle on the table
    // and the reading light at the library desk. Positions map Blender (x, y, z) to
    // three (x, z, -y). Kept modest: the chandelier hangs right over the board, whose
    // colours must stay honest.
    for (const [color, intensity, distance, x, y, z, glowSize] of [
      [0xffa050, 3.6, 5.5, 0, 5.0, -2.2, 0],
      [0xff9040, 3.2, 3.4, -2.72, 1.9, -1.4, 0.55],
      [0xff9648, 3.2, 3.6, -3.1, 1.5, -3.76, 0.55],
      // The three candles on the Dungeon balustrade: they give the step treads (in
      // shadow otherwise) a raking warm light, one per flight of the stair.
      [0xff7a30, 3.0, 3.2, 5.35, 1.40, -0.91, 0.5],
      [0xff7a30, 3.0, 3.2, 6.35, 0.75, -0.06, 0.5],
      [0xff7a30, 3.0, 3.2, 7.25, 0.16, 0.69, 0.5],
    ]) {
      const light = new THREE.PointLight(color, intensity, distance, 2);
      light.position.set(x, y, z);
      if (glowSize) light.userData.glow = { size: glowSize, opacity: 0.5 };
      torches.push(light);
    }
  }

  scene.add(ambient, hemi, key, fill, leftHearth, rightHearth, table, floorBounce, armour, armour.target, ...torches);

  const glowTexture = createGlowTexture();
  const glows = [];
  if (glowTexture) {
    for (const light of torches) {
      const spec = light.userData.glow;
      if (!spec) continue;
      const sprite = createGlowSprite(glowTexture, light.color, spec.size, spec.opacity, light.position);
      scene.add(sprite);
      glows.push({ sprite, light, lightBase: light.intensity, base: spec.opacity, hearth: null });
    }
    for (const [hearth, side] of [[leftHearth, 'left'], [rightHearth, 'right']]) {
      const sprite = createGlowSprite(glowTexture, hearth.color, 2.6, 0.30, hearth.position);
      scene.add(sprite);
      glows.push({ sprite, light: hearth, lightBase: hearth.intensity, base: 0.30, hearth: side });
    }
  }
  const disposeGlows = () => {
    for (const glow of glows) glow.sprite.material.dispose();
    glowTexture?.dispose?.();
  };

  return {
    glows,
    disposeGlows,
    torches: torches.map((light, index) => ({
      light,
      base: light.intensity,
      // A stable phase per torch, so the four never flicker in step.
      phase: stableFirePhase(`home_torch_light_${index}`),
    })),
    leftHearth,
    rightHearth,
    leftHearthBase: leftHearth.intensity,
    rightHearthBase: rightHearth.intensity,
  };
}

function installHomeEnvironment(renderer, scene, enabled = true) {
  if (!enabled) return () => {};
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const target = pmrem.fromScene(room, 0.035);
  pmrem.dispose();

  scene.environment = target.texture;
  scene.environmentIntensity = 0.20;

  return () => {
    if (scene.environment === target.texture) scene.environment = null;
    target.dispose?.();
    room.traverse?.((object) => {
      object.geometry?.dispose?.();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.filter(Boolean).forEach((material) => material.dispose?.());
    });
  };
}


function disposeMaterial(material) {
  if (!material) return;
  for (const value of Object.values(material)) {
    if (value?.isTexture) value.dispose();
  }
  material.dispose?.();
}

function disposeRuntimeScene(root) {
  root?.traverse?.((object) => {
    object.geometry?.dispose?.();
    if (Array.isArray(object.material)) object.material.forEach(disposeMaterial);
    else disposeMaterial(object.material);
  });
}

function prepareRuntimeScene(root, shadowsEnabled = true, renderer = null) {
  const maxAnisotropy = Math.min(
    8,
    renderer?.capabilities?.getMaxAnisotropy?.() || 1,
  );
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = shadowsEnabled;
    object.receiveShadow = shadowsEnabled;
    if (Array.isArray(object.material)) {
      object.material.forEach((material) => {
        if (!material) return;
        for (const texture of [
          material.map,
          material.normalMap,
          material.roughnessMap,
          material.metalnessMap,
          material.aoMap,
        ]) {
          if (!texture?.isTexture) continue;
          texture.anisotropy = Math.max(texture.anisotropy || 1, maxAnisotropy);
          texture.needsUpdate = true;
        }
        material.dithering = true;
        material.needsUpdate = true;
      });
    } else if (object.material) {
      for (const texture of [
        object.material.map,
        object.material.normalMap,
        object.material.roughnessMap,
        object.material.metalnessMap,
        object.material.aoMap,
      ]) {
        if (!texture?.isTexture) continue;
        texture.anisotropy = Math.max(texture.anisotropy || 1, maxAnisotropy);
        texture.needsUpdate = true;
      }
      object.material.dithering = true;
      object.material.needsUpdate = true;
    }
  });
}

export default function HomeBlenderScene3D({
  ambient = 'day',
  onUnavailable = null,
  onAnchorLayout = null,
}) {
  const canvasRef = useRef(null);
  const renderRequestRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const initialPolicy = browserPolicy();
    if (!canvas || !homeBlenderRuntimeEligible()) {
      onUnavailable?.();
      return undefined;
    }

    canvas.classList.remove('is-ready');
    canvas.dataset.homeBlenderRuntime = 'loading';

    let disposed = false;
    let fallbackRequested = false;
    let model = null;
    let fireRig = [];
    let fireFrame = null;
    let lastFireRenderedAt = Number.NEGATIVE_INFINITY;
    let frame = null;
    let loadTimer = null;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: initialPolicy.antialias,
        powerPreference: initialPolicy.powerPreference,
      });
    } catch {
      onUnavailable?.();
      return undefined;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = initialPolicy.lod === 'full';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // The room is static and only emissive flames move, so the shadow map is
    // computed once instead of re-rasterising every mesh on each animated frame.
    renderer.shadowMap.autoUpdate = false;
    renderer.toneMapping = THREE.AgXToneMapping;
    // The lite LOD (phones, small windows) drops the IBL environment, the torch lights
    // and shadows, so the same exposure leaves the room ~2.5x darker than on desktop
    // (measured on staging: luma 14.5 vs 35.7). Compensate with more exposure.
    renderer.toneMappingExposure = (EXPOSURE[ambient] || EXPOSURE.day)
      * (initialPolicy.lod === 'full' ? 1 : HOME_BLENDER_LITE_EXPOSURE_BOOST);
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const releaseEnvironment = installHomeEnvironment(
      renderer,
      scene,
      initialPolicy.lod === 'full',
    );
    // Keep haze behind the playing surface: foreground remains crisp while the
    // rear architecture picks up a restrained warm atmospheric falloff.
    scene.fog = new THREE.Fog(0x170d09, 20, 34);
    const runtimeLights = addRuntimeLights(scene, initialPolicy.lod === 'full', ambient);

    const camera = new THREE.PerspectiveCamera(
      HOME_BLENDER_CAMERA_FOV,
      16 / 9,
      0.1,
      80,
    );

    const renderFrame = () => {
      if (disposed || !model) return;
      camera.position.set(CAMERA_BASE.x, CAMERA_BASE.y, CAMERA_BASE.z);
      camera.lookAt(CAMERA_TARGET.x, CAMERA_TARGET.y, CAMERA_TARGET.z);
      renderer.render(scene, camera);
    };

    const requestRender = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        renderFrame();
      });
    };
    renderRequestRef.current = requestRender;

    const baseFireIntervalMs = initialPolicy.lod === 'full' ? 42 : 66;
    let fireIntervalMs = baseFireIntervalMs;
    let fireRenderCostMs = 0;
    let fireSamples = 0;
    let fireFrameGapMs = 0;
    let fireRafCount = 0;
    let lastFireRafAt = null;
    const animateFire = (timestamp) => {
      fireFrame = null;
      if (disposed || !model || document.hidden) return;
      if (lastFireRafAt !== null) {
        fireRafCount += 1;
        // Ignore the warm-up: decoding the scene legitimately delays the first frames.
        if (fireRafCount > HOME_BLENDER_FIRE_WARMUP_FRAMES) {
          const gap = timestamp - lastFireRafAt;
          fireFrameGapMs = fireFrameGapMs ? fireFrameGapMs * 0.9 + gap * 0.1 : gap;
        }
      }
      lastFireRafAt = timestamp;
      if (timestamp - lastFireRenderedAt >= fireIntervalMs) {
        const lightFactor = applyRuntimeFireMotion(fireRig, timestamp);
        runtimeLights.leftHearth.intensity = runtimeLights.leftHearthBase * lightFactor.left;
        runtimeLights.rightHearth.intensity = runtimeLights.rightHearthBase * lightFactor.right;
        for (const torch of runtimeLights.torches) {
          torch.light.intensity = torch.base
            * homeBlenderFireMotion({ timeMs: timestamp, phase: torch.phase, kind: 'candle' }).light;
        }
        for (const glow of runtimeLights.glows) {
          glow.sprite.material.opacity = homeBlenderGlowOpacity(
            glow.base,
            glow.light.intensity / (glow.lightBase || 1),
          );
        }
        const startedAt = performance.now();
        renderFrame();
        const cost = performance.now() - startedAt;
        fireRenderCostMs = fireSamples === 0 ? cost : fireRenderCostMs * 0.8 + cost * 0.2;
        fireSamples += 1;
        lastFireRenderedAt = timestamp;
        const plan = homeBlenderFireFramePlan({
          baseIntervalMs: baseFireIntervalMs,
          renderCostMs: fireRenderCostMs,
          frameGapMs: fireFrameGapMs,
          samples: fireSamples,
        });
        fireIntervalMs = plan.intervalMs;
        canvas.dataset.homeFireCostMs = fireRenderCostMs.toFixed(1);
        canvas.dataset.homeFireGapMs = fireFrameGapMs.toFixed(1);
        if (!plan.enabled) {
          // Too expensive here: settle on the still frame and stay there.
          canvas.dataset.homeFireMotion = 'off-slow';
          return;
        }
      }
      fireFrame = window.requestAnimationFrame(animateFire);
    };

    const prefersReducedMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const softwareRenderer = homeBlenderIsSoftwareRenderer(readRendererName(renderer));

    const startFireAnimation = () => {
      if (prefersReducedMotion) {
        canvas.dataset.homeFireMotion = 'reduced';
        return;
      }
      if (softwareRenderer) {
        canvas.dataset.homeFireMotion = 'off-software';
        return;
      }
      if (canvas.dataset.homeFireMotion === 'off-slow') return;
      if (disposed || !model || document.hidden || fireFrame !== null) return;
      canvas.dataset.homeFireMotion = 'live';
      lastFireRafAt = null;
      fireFrame = window.requestAnimationFrame(animateFire);
    };

    const stopFireAnimation = () => {
      if (fireFrame !== null) window.cancelAnimationFrame(fireFrame);
      fireFrame = null;
    };

    const onVisibilityChange = () => {
      if (document.hidden) stopFireAnimation();
      else startFireAnimation();
    };

    const resize = () => {
      const width = Math.max(1, canvas.clientWidth || canvas.parentElement?.clientWidth || 1);
      const height = Math.max(1, canvas.clientHeight || canvas.parentElement?.clientHeight || 1);
      const policy = browserPolicy();
      canvas.dataset.homeCastleLod = policy.lod;
      if (homeBlenderPolicyNeedsFallback(policy)) {
        failToFallback(true);
        return;
      }
      renderer.setPixelRatio(Math.min(policy.pixelRatio || 1, 1.5));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.fov = homeBlenderCameraFovForAspect(camera.aspect);
      canvas.dataset.homeBlenderCamera = camera.aspect < 1 ? 'portrait-wide' : 'canonical';
      camera.updateProjectionMatrix();
      if (onAnchorLayout) {
        camera.position.set(CAMERA_BASE.x, CAMERA_BASE.y, CAMERA_BASE.z);
        camera.lookAt(CAMERA_TARGET.x, CAMERA_TARGET.y, CAMERA_TARGET.z);
        onAnchorLayout(homeBlenderProjectAnchors(camera));
      }
      requestRender();
    };

    const failToFallback = (force = false) => {
      if (disposed || fallbackRequested || (!force && model)) return;
      fallbackRequested = true;
      canvas.classList.remove('is-ready');
      canvas.dataset.homeBlenderRuntime = 'fallback';
      onUnavailable?.();
    };
    loadTimer = window.setTimeout(() => failToFallback(), 20_000);

    const loader = new GLTFLoader();
    // The runtime scene is published Meshopt-compressed; uncompressed files still load.
    loader.setMeshoptDecoder(MeshoptDecoder);
    void loadHomeCastleR2Scene({
      logicalId: HOME_BLENDER_RUNTIME_LOGICAL_ID,
      loader,
    }).then((root) => {
      if (disposed) {
        disposeRuntimeScene(root);
        return;
      }
      if (!root) {
        failToFallback();
        return;
      }
      if (loadTimer !== null) {
        window.clearTimeout(loadTimer);
        loadTimer = null;
      }
      model = root;
      prepareRuntimeScene(model, initialPolicy.lod === 'full', renderer);
      applyHomeBlenderMoonVisibility(model, ambient);
      fireRig = prepareRuntimeFireRig(model);
      scene.add(model);
      resize();
      applyRuntimeFireMotion(fireRig, 0);
      renderer.shadowMap.needsUpdate = true;
      renderFrame();
      canvas.dataset.homeBlenderRuntime = 'ready';
      canvas.classList.add('is-ready');
      startFireAnimation();
    });

    const onContextLost = (event) => {
      event.preventDefault();
      failToFallback(true);
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    document.addEventListener('visibilitychange', onVisibilityChange);

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(resize)
      : null;
    resizeObserver?.observe(canvas);
    window.addEventListener('resize', resize, { passive: true });
    resize();

    return () => {
      disposed = true;
      renderRequestRef.current = null;
      if (frame !== null) window.cancelAnimationFrame(frame);
      stopFireAnimation();
      if (loadTimer !== null) window.clearTimeout(loadTimer);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.classList.remove('is-ready');
      if (model) {
        scene.remove(model);
        disposeRuntimeScene(model);
      }
      runtimeLights.disposeGlows?.();
      releaseEnvironment();
      renderer.dispose();
    };
  }, [ambient, onUnavailable]);

  return (
    <canvas
      ref={canvasRef}
      className="illustrated-home__castle-3d"
      data-home-castle-lod="loading"
      data-home-castle-compositor="blender-runtime"
      data-home-castle-picked="none"
      data-home-blender-runtime="loading"
      data-home-blender-camera="canonical"
      aria-hidden="true"
    />
  );
}