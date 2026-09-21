import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
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


const EXPOSURE = Object.freeze({
  dawn: 1.14,
  day: 1.09,
  dusk: 1.13,
  night: 1.17,
});

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
      light: 1,
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

// The fire re-renders the whole room every few frames, which is only worth it when
// a frame is cheap. Two signals decide that: how long the render call takes on the
// main thread, and how late requestAnimationFrame arrives. The second matters
// because WebGL rasterises in the GPU process, so with software GL or a weak GPU the
// render call returns quickly while frames still back up. Stretch the interval so
// the fire stays a small share of the thread, and stop it (leaving the authored
// still frame) on hardware that cannot afford it.
export const HOME_BLENDER_FIRE_MIN_SAMPLES = 6;
export const HOME_BLENDER_FIRE_MAX_RENDER_MS = 24;
export const HOME_BLENDER_FIRE_MAX_FRAME_GAP_MS = 28;
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
  return { enabled: true, intervalMs: Math.min(250, Math.max(baseIntervalMs, cost * 3)) };
}

function prepareRuntimeFireRig(root) {
  const nodes = [];
  root?.traverse?.((object) => {
    if (!object?.isMesh) return;
    const kind = homeBlenderFireKind(object.name);
    if (!kind) return;
    object.castShadow = false;
    if (kind === 'flame' || kind === 'hot') rebaseFlameToPivot(object);

    if (Array.isArray(object.material)) {
      object.material = object.material.map((material) => material?.clone?.() || material);
    } else if (object.material?.clone) {
      object.material = object.material.clone();
    }

    const materials = (Array.isArray(object.material) ? object.material : [object.material])
      .filter(Boolean)
      .map((material) => ({
        material,
        emissiveIntensity: Number(material.emissiveIntensity) || 0,
      }));

    const lowered = object.name.toLowerCase();
    nodes.push({
      object,
      kind,
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
  const factor = ({ sum, count }) => THREE.MathUtils.clamp(1 + (count ? sum / count : 0) * 1.6, 0.86, 1.10);
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


function addRuntimeLights(scene, shadowsEnabled = true) {
  // Keep the browser rendition close to the authored Blender beauty pass:
  // dark stone stays dark and the warm practicals shape the room instead of
  // a large ambient wash flattening every material.
  const ambient = new THREE.AmbientLight(0x9b806b, 0.18);
  const hemi = new THREE.HemisphereLight(0x8198b8, 0x2a1208, 0.36);

  const key = new THREE.DirectionalLight(0xffc18a, 2.05);
  key.position.set(-5.2, 7.4, 8.2);
  key.castShadow = shadowsEnabled;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -9;
  key.shadow.camera.right = 9;
  key.shadow.camera.top = 8;
  key.shadow.camera.bottom = -3;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 28;
  key.shadow.bias = -0.00022;
  key.shadow.normalBias = 0.028;
  key.shadow.intensity = 0.58;

  const fill = new THREE.DirectionalLight(0x587aa8, 0.48);
  fill.position.set(7.2, 4.8, 5.6);

  const leftHearth = new THREE.PointLight(0xff6f24, 18.5, 7.2, 2);
  leftHearth.position.set(-6.15, 0.95, -5.12);

  const rightHearth = new THREE.PointLight(0xff6b21, 19.5, 7.2, 2);
  rightHearth.position.set(4.50, 1.10, -5.00);

  const table = new THREE.PointLight(0xffb66f, 5.2, 8.5, 2);
  table.position.set(0, 4.9, 3.8);

  const floorBounce = new THREE.PointLight(0xff8b45, 4.6, 10.5, 2);
  floorBounce.position.set(0, 0.55, -1.6);

  scene.add(ambient, hemi, key, fill, leftHearth, rightHearth, table, floorBounce);
  return {
    leftHearth,
    rightHearth,
    leftHearthBase: leftHearth.intensity,
    rightHearthBase: rightHearth.intensity,
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

function prepareRuntimeScene(root, shadowsEnabled = true) {
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = shadowsEnabled;
    object.receiveShadow = shadowsEnabled;
    if (Array.isArray(object.material)) {
      object.material.forEach((material) => {
        if (!material) return;
        material.dithering = true;
        material.needsUpdate = true;
      });
    } else if (object.material) {
      object.material.dithering = true;
      object.material.needsUpdate = true;
    }
  });
}

export default function HomeBlenderScene3D({
  ambient = 'day',
  onUnavailable = null,
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
    renderer.toneMappingExposure = EXPOSURE[ambient] || EXPOSURE.day;
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    // Keep haze behind the playing surface: foreground remains crisp while the
    // rear architecture picks up a restrained warm atmospheric falloff.
    scene.fog = new THREE.Fog(0x170d09, 20, 34);
    const runtimeLights = addRuntimeLights(scene, initialPolicy.lod === 'full');

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

    const startFireAnimation = () => {
      if (prefersReducedMotion) {
        canvas.dataset.homeFireMotion = 'reduced';
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
      prepareRuntimeScene(model, initialPolicy.lod === 'full');
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