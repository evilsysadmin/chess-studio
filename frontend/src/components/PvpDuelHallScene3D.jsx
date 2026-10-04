import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createThreeRenderer } from '../threeRenderer.js';
import { scheduleWarRoomAfterFirstPaint } from './WarRoomBlenderShellRuntime.js';
import { installPvpDuelHallShell } from './PvpDuelHallShell.js';

export const PVP_DUEL_HALL_CAMERA = Object.freeze({
  fov: 30,
  position: Object.freeze([0, 7.25, 18.2]),
  target: Object.freeze([0, 2.18, -0.8]),
});

export default function PvpDuelHallScene3D() {
  const canvasRef = useRef(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const host = canvas.parentElement;
    const viewportWidth = Math.max(0, Number(globalThis.innerWidth) || host?.clientWidth || 0);
    const viewportHeight = Math.max(0, Number(globalThis.innerHeight) || host?.clientHeight || 0);
    // The authored camera is composed for a wide room. On phone viewports it crops
    // the architecture into a dark abstraction, while the existing 2D room fallback
    // remains legible and cheaper. Keep 3D for desktop/tablet-sized canvases.
    if (viewportWidth < 720 || viewportHeight < 520) {
      setStatus('fallback-mobile');
      return undefined;
    }

    const coarsePointer = Boolean(globalThis.matchMedia?.('(pointer: coarse)')?.matches);
    let renderer;
    try {
      renderer = createThreeRenderer({
        canvas,
        alpha: true,
        antialias: !coarsePointer,
        powerPreference: coarsePointer ? 'low-power' : 'high-performance',
      });
    } catch {
      setStatus('fallback');
      return undefined;
    }

    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, coarsePointer ? 1 : 1.4));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(PVP_DUEL_HALL_CAMERA.fov, 1, 0.1, 80);
    camera.position.set(...PVP_DUEL_HALL_CAMERA.position);
    camera.lookAt(...PVP_DUEL_HALL_CAMERA.target);

    const hemi = new THREE.HemisphereLight(0x7899c8, 0x24150d, coarsePointer ? 0.58 : 0.72);
    const warm = new THREE.DirectionalLight(0xffb067, coarsePointer ? 0.36 : 0.50);
    warm.position.set(-3.2, 7.0, 8.8);
    warm.target.position.set(0, 1.8, -0.4);
    warm.castShadow = false;
    scene.add(hemi, warm, warm.target);

    let disposed = false;
    let disposeShell = () => {};

    const render = () => {
      if (!disposed) renderer.render(scene, camera);
    };

    const resize = () => {
      if (disposed) return;
      const width = Math.max(1, host?.clientWidth || canvas.clientWidth || 1);
      const height = Math.max(1, host?.clientHeight || canvas.clientHeight || 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      render();
    };

    const start = async () => {
      try {
        const cleanup = await installPvpDuelHallShell(scene, {
          coarsePointer,
          whiteSide: true,
          onRefine: render,
        });
        if (disposed) {
          cleanup?.();
          return;
        }
        disposeShell = cleanup || (() => {});
        setStatus('ready');
        resize();
      } catch {
        if (!disposed) setStatus('fallback');
      }
    };

    resize();
    const cancelStart = scheduleWarRoomAfterFirstPaint(() => { void start(); });

    let observer = null;
    if (typeof ResizeObserver === 'function' && host) {
      observer = new ResizeObserver(resize);
      observer.observe(host);
    } else {
      globalThis.addEventListener?.('resize', resize);
    }

    return () => {
      disposed = true;
      cancelStart();
      observer?.disconnect();
      if (!observer) globalThis.removeEventListener?.('resize', resize);
      disposeShell();
      renderer.dispose();
    };
  }, []);

  return (
    <div className={`pvp-duel-hall__3d is-${status}`} data-pvp-duel-hall-3d={status} aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}
