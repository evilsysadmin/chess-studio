import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
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


const EXPOSURE = Object.freeze({
  dawn: 1.08,
  day: 1.03,
  dusk: 1.07,
  night: 1.11,
});

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
  const hemi = new THREE.HemisphereLight(0x8198b8, 0x2a1208, 0.28);

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

  const leftHearth = new THREE.PointLight(0xff6f24, 15.8, 7.0, 2);
  leftHearth.position.set(-6.15, 0.95, -5.12);

  const rightHearth = new THREE.PointLight(0xff6b21, 16.6, 7.0, 2);
  rightHearth.position.set(4.50, 1.10, -5.00);

  const table = new THREE.PointLight(0xffb66f, 3.35, 7.4, 2);
  table.position.set(0, 4.9, 3.8);

  const floorBounce = new THREE.PointLight(0xff8b45, 2.15, 8.8, 2);
  floorBounce.position.set(0, 0.55, -1.6);

  scene.add(ambient, hemi, key, fill, leftHearth, rightHearth, table, floorBounce);
}

function installHomeEnvironment(renderer, scene, enabled = true) {
  if (!enabled) return () => {};
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const target = pmrem.fromScene(room, 0.035);
  pmrem.dispose();

  scene.environment = target.texture;
  scene.environmentIntensity = 0.24;

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

function stableSurfaceVariation(name = '') {
  let hash = 2166136261;
  for (let index = 0; index < name.length; index += 1) {
    hash ^= name.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const unit = ((hash >>> 0) % 10000) / 10000;
  return {
    offsetX: (unit * 0.37) % 1,
    offsetY: (unit * 0.73 + 0.19) % 1,
    repeat: 0.92 + ((hash >>> 8) & 0xff) / 255 * 0.18,
  };
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
    const surfaceVariation = stableSurfaceVariation(object.name);
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
          if (texture.wrapS !== THREE.RepeatWrapping || texture.wrapT !== THREE.RepeatWrapping) {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
          }
          texture.offset.set(surfaceVariation.offsetX, surfaceVariation.offsetY);
          texture.repeat.multiplyScalar(surfaceVariation.repeat);
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
        if (texture.wrapS !== THREE.RepeatWrapping || texture.wrapT !== THREE.RepeatWrapping) {
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
        }
        texture.offset.set(surfaceVariation.offsetX, surfaceVariation.offsetY);
        texture.repeat.multiplyScalar(surfaceVariation.repeat);
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
    const releaseEnvironment = installHomeEnvironment(
      renderer,
      scene,
      initialPolicy.lod === 'full',
    );
    // Keep haze behind the playing surface: foreground remains crisp while the
    // rear architecture picks up a restrained warm atmospheric falloff.
    scene.fog = new THREE.Fog(0x170d09, 20, 34);
    addRuntimeLights(scene, initialPolicy.lod === 'full');

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
      prepareRuntimeScene(model, initialPolicy.lod === 'full', renderer);
      scene.add(model);
      resize();
      renderFrame();
      canvas.dataset.homeBlenderRuntime = 'ready';
      canvas.classList.add('is-ready');
    });

    const onContextLost = (event) => {
      event.preventDefault();
      failToFallback(true);
    };
    canvas.addEventListener('webglcontextlost', onContextLost);

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
      if (loadTimer !== null) window.clearTimeout(loadTimer);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.classList.remove('is-ready');
      if (model) {
        scene.remove(model);
        disposeRuntimeScene(model);
      }
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