import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createThreeRenderer } from '../threeRenderer.js';
import {
  buildInsightsTrainingRoomLayer,
  disposeInsightsTrainingRoomLayer,
} from './InsightsTrainingRoomShell.js';

export const INSIGHTS_TRAINING_ROOM_CAMERA = Object.freeze({
  fov: 31.5,
  position: Object.freeze([0.18, 4.28, 12.15]),
  target: Object.freeze([0.25, 2.02, -2.28]),
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
    let environmentTarget;

    try {
      renderer = createThreeRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.24;
      renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.4));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x0b0d12, .0062);

      const pmrem = new THREE.PMREMGenerator(renderer);
      environmentTarget = pmrem.fromScene(new RoomEnvironment(), .04);
      scene.environment = environmentTarget.texture;
      scene.environmentIntensity = .36;
      pmrem.dispose();

      const camera = new THREE.PerspectiveCamera(
        INSIGHTS_TRAINING_ROOM_CAMERA.fov,
        1,
        .1,
        80,
      );
      camera.position.set(...INSIGHTS_TRAINING_ROOM_CAMERA.position);
      camera.lookAt(...INSIGHTS_TRAINING_ROOM_CAMERA.target);

      const hemisphere = new THREE.HemisphereLight(0x92acd0, 0x1c100a, .7);
      hemisphere.name = 'training-room-hemisphere';
      scene.add(hemisphere);

      const softKey = new THREE.DirectionalLight(0xffc88f, .84);
      softKey.position.set(-3.5, 7.4, 5.8);
      softKey.castShadow = true;
      softKey.shadow.mapSize.set(1024, 1024);
      softKey.shadow.camera.near = 1;
      softKey.shadow.camera.far = 28;
      softKey.shadow.camera.left = -10;
      softKey.shadow.camera.right = 10;
      softKey.shadow.camera.top = 9;
      softKey.shadow.camera.bottom = -6;
      softKey.shadow.bias = -.00035;
      softKey.name = 'training-room-soft-key';
      scene.add(softKey);

      const cameraFill = new THREE.PointLight(0xffc98c, .28, 18, 2);
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
      environmentTarget?.dispose?.();
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
