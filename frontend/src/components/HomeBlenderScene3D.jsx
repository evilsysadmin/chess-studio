import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadHomeCastleR2Scene } from './HomeCastle3DR2Asset.js';
import { homeCastle3DRenderPolicy } from './HomeCastle3DRenderPolicy.js';

export const HOME_BLENDER_RUNTIME_LOGICAL_ID = 'home.scene.runtime';
export const HOME_BLENDER_RUNTIME_MIN_WIDTH = 1000;
export const HOME_BLENDER_CAMERA_FOV = 22.9;

const CAMERA_BASE = Object.freeze({ x: 0, y: 4.85, z: 16 });
const CAMERA_TARGET = Object.freeze({ x: 0, y: 1.55, z: -2.3 });
const ROOM_FOCUS = Object.freeze({
  tournament: Object.freeze({ x: -0.20, y: 0.03 }),
  train: Object.freeze({ x: -0.11, y: 0.01 }),
  combat: Object.freeze({ x: 0.11, y: 0.02 }),
  daily: Object.freeze({ x: 0.20, y: 0.02 }),
  history: Object.freeze({ x: -0.18, y: -0.02 }),
  play: Object.freeze({ x: 0, y: -0.05 }),
  pawnslug: Object.freeze({ x: 0.20, y: -0.05 }),
  dungeon: Object.freeze({ x: 0.27, y: -0.07 }),
});

const EXPOSURE = Object.freeze({
  dawn: 1.08,
  day: 0.98,
  dusk: 1.04,
  night: 1.10,
});

function browserPolicy() {
  if (typeof window === 'undefined') {
    return homeCastle3DRenderPolicy({
      viewportWidth: 0,
      hardwareConcurrency: 4,
    });
  }
  return homeCastle3DRenderPolicy({
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

function addRuntimeLights(scene) {
  // Keep the browser rendition close to the authored Blender beauty pass:
  // dark stone stays dark and the warm practicals shape the room instead of
  // a large ambient wash flattening every material.
  const ambient = new THREE.AmbientLight(0x8f9298, 0.22);
  const hemi = new THREE.HemisphereLight(0x8fa6c4, 0x120806, 0.48);

  const key = new THREE.DirectionalLight(0xffc996, 1.85);
  key.position.set(-5.2, 7.4, 8.2);

  const fill = new THREE.DirectionalLight(0x587aa8, 0.52);
  fill.position.set(7.2, 4.8, 5.6);

  const leftHearth = new THREE.PointLight(0xff6720, 13, 6.5, 2);
  leftHearth.position.set(-6.15, 0.95, -5.12);

  const rightHearth = new THREE.PointLight(0xff641d, 14, 6.5, 2);
  rightHearth.position.set(4.50, 1.10, -5.00);

  const table = new THREE.PointLight(0xffbf7d, 3.1, 8, 2);
  table.position.set(0, 4.9, 3.8);

  scene.add(ambient, hemi, key, fill, leftHearth, rightHearth, table);
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

function prepareRuntimeScene(root) {
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = false;
    object.receiveShadow = false;
    if (Array.isArray(object.material)) {
      object.material.forEach((material) => {
        if (material) material.needsUpdate = true;
      });
    } else if (object.material) {
      object.material.needsUpdate = true;
    }
  });
}

export default function HomeBlenderScene3D({
  ambient = 'day',
  activeRoom = null,
  onUnavailable = null,
}) {
  const canvasRef = useRef(null);
  const activeRoomRef = useRef(activeRoom);
  const renderRequestRef = useRef(null);

  useEffect(() => {
    activeRoomRef.current = activeRoom;
    renderRequestRef.current?.();
  }, [activeRoom]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !homeBlenderRuntimeEligible()) {
      onUnavailable?.();
      return undefined;
    }

    canvas.classList.remove('is-ready');
    canvas.dataset.homeBlenderRuntime = 'loading';

    let disposed = false;
    let model = null;
    let frame = null;
    let loadTimer = null;
    let pointerX = 0;
    let pointerY = 0;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch {
      onUnavailable?.();
      return undefined;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = EXPOSURE[ambient] || EXPOSURE.day;
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    addRuntimeLights(scene);

    const camera = new THREE.PerspectiveCamera(
      HOME_BLENDER_CAMERA_FOV,
      16 / 9,
      0.1,
      80,
    );

    const renderFrame = () => {
      if (disposed || !model) return;
      const focus = ROOM_FOCUS[activeRoomRef.current] || { x: 0, y: 0 };
      camera.position.set(
        CAMERA_BASE.x + pointerX * 0.12 + focus.x * 0.22,
        CAMERA_BASE.y - pointerY * 0.075 + focus.y * 0.14,
        CAMERA_BASE.z,
      );
      camera.lookAt(
        CAMERA_TARGET.x + pointerX * 0.035 + focus.x * 0.42,
        CAMERA_TARGET.y - pointerY * 0.025 + focus.y * 0.22,
        CAMERA_TARGET.z,
      );
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
      renderer.setPixelRatio(Math.min(policy.pixelRatio || 1, 1.5));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      requestRender();
    };

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const onPointerMove = reducedMotion ? null : (event) => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pointerX = THREE.MathUtils.clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
      pointerY = THREE.MathUtils.clamp(((event.clientY - rect.top) / rect.height) * 2 - 1, -1, 1);
      requestRender();
    };
    const onPointerLeave = reducedMotion ? null : () => {
      pointerX = 0;
      pointerY = 0;
      requestRender();
    };
    if (onPointerMove) canvas.addEventListener('pointermove', onPointerMove, { passive: true });
    if (onPointerLeave) canvas.addEventListener('pointerleave', onPointerLeave, { passive: true });

    const failToFallback = (force = false) => {
      if (disposed || (!force && model)) return;
      canvas.classList.remove('is-ready');
      canvas.dataset.homeBlenderRuntime = 'fallback';
      onUnavailable?.();
    };
    loadTimer = window.setTimeout(failToFallback, 7000);

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
      window.clearTimeout(loadTimer);
      loadTimer = null;
      model = root;
      prepareRuntimeScene(model);
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
      if (onPointerMove) canvas.removeEventListener('pointermove', onPointerMove);
      if (onPointerLeave) canvas.removeEventListener('pointerleave', onPointerLeave);
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
      data-home-castle-lod="full"
      data-home-castle-compositor="blender-runtime"
      data-home-castle-picked="none"
      data-home-blender-runtime="loading"
      aria-hidden="true"
    />
  );
}