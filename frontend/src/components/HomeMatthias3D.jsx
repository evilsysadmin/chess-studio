import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createExperimentalThreeRenderer } from '../experimentalThreeRenderer.js';
import { buildHomeMatthiasAvatar3D } from './HomeMatthiasAvatar3D.js';
import './HomeMatthias3D.css';

function disposeObject(root) {
  const geometries = new Set();
  const materials = new Set();
  root?.traverse?.((node) => {
    if (node.geometry) geometries.add(node.geometry);
    const materialList = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materialList) {
      if (material) materials.add(material);
    }
  });
  geometries.forEach((geometry) => geometry.dispose?.());
  materials.forEach((material) => material.dispose?.());
}

function motionProfile(sceneKey) {
  const key = String(sceneKey || '').toLowerCase();
  if (/doze|sleep|rest/.test(key)) {
    return { pace: 0.62, sway: 0.55, headPitch: 0.055, headYaw: 0.45 };
  }
  if (/read|write|dossier|study|board|notes/.test(key)) {
    return { pace: 0.84, sway: 0.62, headPitch: 0.028, headYaw: 0.7 };
  }
  if (/night|late/.test(key)) {
    return { pace: 0.72, sway: 0.7, headPitch: 0.018, headYaw: 0.72 };
  }
  return { pace: 1, sway: 1, headPitch: 0, headYaw: 1 };
}

export default function HomeMatthias3D({
  fallbackAvatar,
  scene = 'base',
  speaking = false,
  reducedMotion = false,
}) {
  const hostRef = useRef(null);
  const canvasRef = useRef(null);
  const liveStateRef = useRef({ scene, speaking });
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  liveStateRef.current = { scene, speaking };

  useEffect(() => {
    if (failed) return undefined;
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return undefined;

    let renderer;
    try {
      renderer = createExperimentalThreeRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setFailed(true);
      return undefined;
    }

    let disposed = false;
    let animationFrame = 0;
    let inViewport = true;
    let motionTick = -1;
    const coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, coarsePointer ? 1.35 : 1.8);

    renderer.setPixelRatio(pixelRatio);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const stage = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(29, 1, 0.1, 20);
    camera.position.set(0, 0.86, 3.28);
    camera.lookAt(0, 0.82, 0);

    const matthias = buildHomeMatthiasAvatar3D({ coarsePointer });
    matthias.position.set(0, 0.015, 0);
    matthias.rotation.y = 0.018;
    stage.add(matthias);

    const headRig = matthias.getObjectByName('home-matthias-head-rig');
    const bodyRig = matthias.getObjectByName('home-matthias-body-rig');
    const basePosition = matthias.position.clone();
    const baseRotation = matthias.rotation.clone();
    const baseScale = matthias.scale.clone();
    const baseHeadRotation = headRig?.rotation.clone();
    const baseBodyRotation = bodyRig?.rotation.clone();
    const eyeNodes = [
      matthias.getObjectByName('home-matthias-eye-white-left'),
      matthias.getObjectByName('home-matthias-eye-white-right'),
      matthias.getObjectByName('home-matthias-eye-left'),
      matthias.getObjectByName('home-matthias-eye-right'),
    ].filter(Boolean);
    const eyeBaseScaleY = eyeNodes.map((eye) => eye.scale.y);

    const hemisphere = new THREE.HemisphereLight(0xf7e6ca, 0x10141b, 2.35);
    stage.add(hemisphere);

    const keyLight = new THREE.DirectionalLight(0xffdfaa, 4.8);
    keyLight.position.set(-2.1, 3.2, 3.6);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(coarsePointer ? 512 : 1024, coarsePointer ? 512 : 1024);
    keyLight.shadow.camera.near = 0.1;
    keyLight.shadow.camera.far = 9;
    stage.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x789dcc, 2.15);
    rimLight.position.set(2.5, 1.9, -2.1);
    stage.add(rimLight);

    const warmFill = new THREE.PointLight(0xd4a75a, 1.55, 5.5, 2);
    warmFill.position.set(1.2, 0.8, 2.15);
    stage.add(warmFill);

    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.55, 0.72),
      new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.24 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0, 0.008, 0.05);
    shadow.receiveShadow = true;
    stage.add(shadow);

    function resize() {
      if (disposed) return;
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    function poseAt(timeSeconds, animate) {
      const { scene: currentScene, speaking: currentSpeaking } = liveStateRef.current;
      const profile = motionProfile(currentScene);
      const t = timeSeconds * profile.pace;
      const breath = Math.sin(t * 1.72);
      const slowSway = Math.sin(t * 0.72 + 0.45);
      const listening = currentSpeaking ? 1 : 0;

      matthias.position.copy(basePosition);
      matthias.rotation.copy(baseRotation);
      matthias.scale.copy(baseScale);

      if (animate) {
        matthias.position.y += breath * 0.0065;
        matthias.rotation.z += slowSway * 0.006 * profile.sway;
        matthias.rotation.y += Math.sin(t * 0.43) * 0.017 * profile.sway;
        matthias.scale.y *= 1 + breath * 0.0025;
      }

      if (bodyRig && baseBodyRotation) {
        bodyRig.rotation.copy(baseBodyRotation);
        if (animate) bodyRig.rotation.z += slowSway * 0.004 * profile.sway;
      }

      if (headRig && baseHeadRotation) {
        headRig.rotation.copy(baseHeadRotation);
        headRig.rotation.x += profile.headPitch;
        if (animate) {
          headRig.rotation.y += Math.sin(t * 0.64 + 0.7) * 0.038 * profile.headYaw;
          headRig.rotation.x += Math.sin(t * 0.92) * 0.011;
          if (listening) {
            headRig.rotation.x += Math.sin(t * 2.35) * 0.01 - 0.01;
            headRig.rotation.y += Math.sin(t * 1.75) * 0.011;
          }
        }
      }

      const blinkCycle = (timeSeconds + 1.05) % 4.9;
      const blinkAmount = animate && blinkCycle < 0.14
        ? Math.sin((blinkCycle / 0.14) * Math.PI)
        : 0;
      eyeNodes.forEach((eye, index) => {
        eye.scale.y = eyeBaseScaleY[index] * (1 - blinkAmount * 0.9);
      });
    }

    function renderOnce(timeSeconds = 0, animate = false) {
      poseAt(timeSeconds, animate);
      renderer.render(stage, camera);
    }

    function loop(now) {
      if (disposed) return;
      if (inViewport && !document.hidden) {
        const seconds = now / 1000;
        renderOnce(seconds, true);
        const nextTick = Math.floor(seconds * 2);
        if (nextTick !== motionTick) {
          motionTick = nextTick;
          canvas.dataset.motionTick = String(nextTick);
        }
      }
      animationFrame = window.requestAnimationFrame(loop);
    }

    const onContextLost = (event) => {
      event.preventDefault();
      if (!disposed) setFailed(true);
    };
    canvas.addEventListener('webglcontextlost', onContextLost, false);

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(resize)
      : null;
    resizeObserver?.observe(host);
    if (!resizeObserver) window.addEventListener('resize', resize);

    const intersectionObserver = typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(([entry]) => { inViewport = entry?.isIntersecting ?? true; }, { threshold: 0.01 })
      : null;
    intersectionObserver?.observe(host);

    resize();
    renderOnce(0, false);
    canvas.dataset.motion = reducedMotion ? 'still-3d' : 'procedural-3d';
    canvas.dataset.matthiasIdentity = 'canonical-officer-avatar';
    setReady(true);
    if (!reducedMotion) animationFrame = window.requestAnimationFrame(loop);

    return () => {
      disposed = true;
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      intersectionObserver?.disconnect();
      resizeObserver?.disconnect();
      if (!resizeObserver) window.removeEventListener('resize', resize);
      canvas.removeEventListener('webglcontextlost', onContextLost, false);
      stage.remove(matthias);
      disposeObject(matthias);
      disposeObject(stage);
      renderer.dispose();
    };
  }, [failed, reducedMotion]);

  if (failed) {
    return (
      <span className="home-matthias-3d is-fallback" data-home-matthias-3d="fallback" aria-hidden="true">
        {fallbackAvatar ? <img src={fallbackAvatar} alt="" draggable="false" /> : null}
      </span>
    );
  }

  return (
    <span
      ref={hostRef}
      className={`home-matthias-3d${ready ? ' is-ready' : ''}`}
      data-home-matthias-3d={ready ? 'ready' : 'loading'}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} />
    </span>
  );
}
