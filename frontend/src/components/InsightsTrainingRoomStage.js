import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  buildInsightsTrainingRoomLayer,
  disposeInsightsTrainingRoomLayer,
} from './InsightsTrainingRoomShell.js';

// The Así juegas study, shared by the live scene (InsightsTrainingRoomScene3D)
// and by the offline still renderer (scripts/render_insights_training_room_still.mjs),
// so the static image shown on software WebGL is this exact room.

export const INSIGHTS_TRAINING_ROOM_CAMERA = Object.freeze({
  fov: 31.5,
  position: Object.freeze([0.18, 4.28, 12.15]),
  target: Object.freeze([0.25, 2.02, -2.28]),
});

// The still is rendered at the widest stage aspect (the stage caps at
// 1658×788). With a fixed vertical FOV, a narrower stage is the same picture
// cropped at the centre, which is what `object-fit: cover` does.
export const INSIGHTS_TRAINING_ROOM_STILL_SIZE = Object.freeze({ width: 2240, height: 1064 });

export function configureInsightsTrainingRoomRenderer(renderer, { pixelRatio = Math.min(globalThis.devicePixelRatio || 1, 1.4) } = {}) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.24;
  renderer.setPixelRatio(pixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}

export function buildInsightsTrainingRoomStage(renderer) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0b0d12, .0062);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentTarget = pmrem.fromScene(new RoomEnvironment(), .04);
  scene.environment = environmentTarget.texture;
  scene.environmentIntensity = .36;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(INSIGHTS_TRAINING_ROOM_CAMERA.fov, 1, .1, 80);
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

  const room = buildInsightsTrainingRoomLayer({ coarsePointer: false });
  scene.add(room);

  const render = (width, height) => {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  };

  const dispose = () => {
    scene.remove(room);
    disposeInsightsTrainingRoomLayer(room);
    environmentTarget.dispose();
  };

  return { scene, camera, render, dispose };
}

// Software rasterisers (SwiftShader, llvmpipe...) take ~10 s to compile this
// room's first frame on the CPU; they get the pre-rendered still instead.
export function insightsTrainingRoomRendererName(renderer) {
  try {
    const gl = renderer.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
  } catch {
    return '';
  }
}
