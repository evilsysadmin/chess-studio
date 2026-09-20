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
  dawn: 1.10,
  day: 1.05,
  dusk: 1.09,
  night: 1.13,
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

export function homeBlenderFireMotion({
  timeMs = 0,
  phase = 0,
  kind = 'flame',
} = {}) {
  const seconds = Math.max(0, Number(timeMs) || 0) / 1000;
  const wave = (
    Math.sin(seconds * 6.4 + phase)
    + Math.sin(seconds * 10.7 + phase * 1.73) * 0.42
    + Math.sin(seconds * 3.1 + phase * 0.61) * 0.24
  ) / 1.66;
  const shimmer = (
    Math.sin(seconds * 13.3 + phase * 0.47)
    + Math.sin(seconds * 7.9 + phase * 1.21) * 0.5
  ) / 1.5;

  if (kind === 'ember') {
    return {
      scaleX: 1 + wave * 0.025,
      scaleY: 1 + shimmer * 0.018,
      scaleZ: 1 + wave * 0.025,
      emission: 0.86 + (shimmer + 1) * 0.07,
      light: 0.96 + wave * 0.035,
    };
  }

  const amplitude = kind === 'hot' ? 0.055 : 0.105;
  return {
    scaleX: 1 - wave * amplitude * 0.34,
    scaleY: 1 + wave * amplitude,
    scaleZ: 1 - wave * amplitude * 0.22,
    emission: 0.88 + (shimmer + 1) * (kind === 'hot' ? 0.09 : 0.07),
    light: 0.94 + wave * 0.075 + shimmer * 0.025,
  };
}

function prepareRuntimeFireRig(root) {
  const nodes = [];
  root?.traverse?.((object) => {
    if (!object?.isMesh) return;
    const kind = homeBlenderFireKind(object.name);
    if (!kind) return;

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

    nodes.push({
      object,
      kind,
      phase: stableFirePhase(object.name),
      baseScale: object.scale.clone(),
      materials,
    });
  });
  return nodes;
}

function applyRuntimeFireMotion(nodes, timeMs) {
  let lightFactor = 1;
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
    for (const { material, emissiveIntensity } of node.materials) {
      if ('emissiveIntensity' in material) {
        material.emissiveIntensity = emissiveIntensity * motion.emission;
      }
    }
    if (node.kind !== 'ember') lightFactor += (motion.light - 1) * 0.08;
  }
  return THREE.MathUtils.clamp(lightFactor, 0.88, 1.10);
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
  const ambient = new THREE.AmbientLight(0x9b806b, 0.14);
  const hemi = new THREE.HemisphereLight(0x8198b8, 0x2a1208, 0.30);

  const key = new THREE.DirectionalLight(0xffc18a, 2.15);
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

  const fill = new THREE.DirectionalLight(0x5678a6, 0.38);
  fill.position.set(7.2, 4.8, 5.6);

  const leftHearth = new THREE.PointLight(0xff6f24, 18.5, 7.2, 2);
  leftHearth.position.set(-6.15, 0.95, -5.12);

  const rightHearth = new THREE.PointLight(0xff6b21, 19.5, 7.2, 2);
  rightHearth.position.set(4.50, 1.10, -5.00);

  const table = new THREE.PointLight(0xffb66f, 4.4, 8.5, 2);
  table.position.set(0, 4.9, 3.8);

  const floorBounce = new THREE.PointLight(0xff8b45, 3.8, 10.5, 2);
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

    const fireFrameIntervalMs = initialPolicy.lod === 'full' ? 42 : 66;
    const animateFire = (timestamp) => {
      fireFrame = null;
      if (disposed || !model || document.hidden) return;
      if (timestamp - lastFireRenderedAt >= fireFrameIntervalMs) {
        const lightFactor = applyRuntimeFireMotion(fireRig, timestamp);
        runtimeLights.leftHearth.intensity = runtimeLights.leftHearthBase * lightFactor;
        runtimeLights.rightHearth.intensity = runtimeLights.rightHearthBase
          * THREE.MathUtils.clamp(lightFactor * 0.985 + 0.015, 0.88, 1.10);
        renderFrame();
        lastFireRenderedAt = timestamp;
      }
      fireFrame = window.requestAnimationFrame(animateFire);
    };

    const startFireAnimation = () => {
      if (disposed || !model || document.hidden || fireFrame !== null) return;
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