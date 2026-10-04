import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createThreeRenderer } from '../threeRenderer.js';
import {
  buildInsightsTrainingRoomLayer,
  disposeInsightsTrainingRoomLayer,
} from './InsightsTrainingRoomShell.js';

export const INSIGHTS_TRAINING_ROOM_CAMERA = Object.freeze({
  fov: 34,
  position: Object.freeze([0, 4.45, 12.8]),
  target: Object.freeze([0, 2.05, -2.15]),
});

function renderScene(renderer, scene, camera, host) {
  if (!renderer || !scene || !camera || !host) return;
  const rect = host.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
}

export default function InsightsTrainingRoomScene3D() {
  const canvasRef = useRef(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const host = canvas.parentElement;
    const viewportWidth = Math.max(0, Number(globalThis.innerWidth) || host?.clientWidth || 0);
    const viewportHeight = Math.max(0, Number(globalThis.innerHeight) || host?.clientHeight || 0);

    // The room is composed as a wide study. Phones get the existing readable
    // coaching layout with a lightweight diegetic CSS backdrop instead of
    // paying for a WebGL scene that would mostly be cropped away.
    if (viewportWidth < 760 || viewportHeight < 560) {
      setStatus('fallback-mobile');
      return undefined;
    }

    let renderer;
    let scene;
    let room;
    let observer;
    let onResize;

    try {
      renderer = createThreeRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.42;
      renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.35));

      scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x0b0d12, .007);

      const camera = new THREE.PerspectiveCamera(
        INSIGHTS_TRAINING_ROOM_CAMERA.fov,
        1,
        .1,
        80,
      );
      camera.position.set(...INSIGHTS_TRAINING_ROOM_CAMERA.position);
      camera.lookAt(...INSIGHTS_TRAINING_ROOM_CAMERA.target);

      const hemisphere = new THREE.HemisphereLight(0x9bb6da, 0x24150c, 1.08);
      hemisphere.name = 'training-room-hemisphere';
      scene.add(hemisphere);

      const softKey = new THREE.DirectionalLight(0xffd39a, .94);
      softKey.position.set(-3.5, 7.4, 5.8);
      softKey.castShadow = false;
      softKey.name = 'training-room-soft-key';
      scene.add(softKey);

      const cameraFill = new THREE.PointLight(0xffcf96, .48, 18, 2);
      cameraFill.position.set(-1.8, 4.4, 8.2);
      cameraFill.castShadow = false;
      cameraFill.name = 'training-room-camera-fill';
      scene.add(cameraFill);

      room = buildInsightsTrainingRoomLayer({ coarsePointer: false });
      scene.add(room);

      const draw = () => renderScene(renderer, scene, camera, host);
      draw();

      if (typeof ResizeObserver === 'function') {
        observer = new ResizeObserver(draw);
        observer.observe(host);
      } else {
        onResize = draw;
        globalThis.addEventListener?.('resize', onResize);
      }

      setStatus('ready');
    } catch {
      setStatus('fallback');
    }

    return () => {
      observer?.disconnect?.();
      if (onResize) globalThis.removeEventListener?.('resize', onResize);
      if (room) {
        scene?.remove?.(room);
        disposeInsightsTrainingRoomLayer(room);
      }
      renderer?.dispose?.();
    };
  }, []);

  return (
    <div
      className={`insights-training-room-3d is-${status}`}
      data-insights-training-room-3d={status}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
