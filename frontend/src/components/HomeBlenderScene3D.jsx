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
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -9;
  key.shadow.camera.right = 9;
  key.shadow.camera.top = 8;
  key.shadow.camera.bottom = -3;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 28;
  key.shadow.bias = -0.00035;
  key.shadow.normalBias = 0.035;
  key.shadow.intensity = 0.45;

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
    object.castShadow = true;
    object.receiveShadow = true;
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