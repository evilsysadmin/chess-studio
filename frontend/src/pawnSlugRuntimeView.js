import * as THREE from 'three';
import { PAWN_SLUG_WORLD } from './pawnSlug.js';
import { createMatthiasSlugModel, createSlugEnvironment, disposePawnSlugObject } from './pawnSlugArt.js';
import { pawnSlugCameraLookAhead } from './pawnSlugCamera.js';
import { createPawnSlugPremiumLandmarks } from './pawnSlugLandmarks.js';
import {
  createPawnSlugPlatforms,
  pawnSlugPlatformCameraY,
  pawnSlugPlatformLookAtY,
} from './pawnSlugPlatforms.js';
import { PAWN_SLUG_RUNTIME_HOT_PATH } from './pawnSlugRuntimeHotPath.js';
import { createWeaponSprite as createRuntimeWeaponSprite } from './pawnSlugSpriteCore.js';
import { disposePawnSlugSprite } from './pawnSlugSprites.js';
import {
  PAWN_SLUG_PLAYER_SPEED,
  PAWN_SLUG_VIEW_H,
  PAWN_SLUG_VIEW_W,
  pawnSlugClamp,
  pawnSlugWorldX,
} from './pawnSlugRuntimeCore.js';

export function pawnSlugViewportBounds(width, height) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const aspect = safeWidth / safeHeight;
  const targetAspect = PAWN_SLUG_VIEW_W / PAWN_SLUG_VIEW_H;
  if (aspect >= targetAspect) {
    const extra = aspect / targetAspect;
    return {
      width: safeWidth,
      height: safeHeight,
      left: -(PAWN_SLUG_VIEW_W * extra) / 2,
      right: (PAWN_SLUG_VIEW_W * extra) / 2,
      top: PAWN_SLUG_VIEW_H / 2,
      bottom: -PAWN_SLUG_VIEW_H / 2,
    };
  }
  const extra = targetAspect / aspect;
  return {
    width: safeWidth,
    height: safeHeight,
    left: -PAWN_SLUG_VIEW_W / 2,
    right: PAWN_SLUG_VIEW_W / 2,
    top: (PAWN_SLUG_VIEW_H * extra) / 2,
    bottom: -(PAWN_SLUG_VIEW_H * extra) / 2,
  };
}

export function createPawnSlugRuntimeView(host, { coarse = false, reducedMotion = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: !coarse, alpha: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x11151b, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.25 : 1.7));
  renderer.shadowMap.enabled = !coarse;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.replaceChildren(renderer.domElement);
  host.dataset.pawnSlugRuntimeHotPath = PAWN_SLUG_RUNTIME_HOT_PATH;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x141921);
  scene.fog = new THREE.Fog(0x161b23, 25, 76);

  const camera = new THREE.OrthographicCamera(
    -PAWN_SLUG_VIEW_W / 2,
    PAWN_SLUG_VIEW_W / 2,
    PAWN_SLUG_VIEW_H / 2,
    -PAWN_SLUG_VIEW_H / 2,
    0.1,
    80,
  );
  camera.position.set(PAWN_SLUG_VIEW_W / 2, 5.1, 15);
  camera.lookAt(PAWN_SLUG_VIEW_W / 2, 4.25, 0);

  const hemi = new THREE.HemisphereLight(0xb9c9df, 0x332a21, 1.7);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd7a1, 2.6);
  sun.position.set(-6, 12, 10);
  sun.castShadow = renderer.shadowMap.enabled;
  sun.shadow.mapSize.set(coarse ? 512 : 1024, coarse ? 512 : 1024);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x6a88bd, 1.1);
  rim.position.set(8, 6, -10);
  scene.add(rim);

  const { root: environmentRoot, far: farEnvironment } = createSlugEnvironment(scene);
  createPawnSlugPremiumLandmarks(environmentRoot, { coarse });
  createPawnSlugPlatforms(environmentRoot, { coarse });
  const dynamic = new THREE.Group();
  const projectileLayer = new THREE.Group();
  const fxLayer = new THREE.Group();
  scene.add(dynamic, projectileLayer, fxLayer);

  const playerModel = createMatthiasSlugModel();
  // Weapon art is now a dedicated overlay. Matthias himself never swaps to the
  // old weapon-specific full-body atlases, which were visually a different man.
  const playerWeaponModel = createRuntimeWeaponSprite('pistol');
  playerWeaponModel.name = 'pawn-slug-player-weapon';
  playerWeaponModel.userData.pawnSlugCanonicalWeaponOverlay = true;
  scene.add(playerModel, playerWeaponModel);

  function clearGroup(group) {
    for (const child of [...group.children]) {
      group.remove(child);
      disposePawnSlugObject(child);
    }
  }

  function resetDynamic() {
    clearGroup(dynamic);
    clearGroup(projectileLayer);
    clearGroup(fxLayer);
  }

  function resetCamera(state) {
    camera.position.x = PAWN_SLUG_VIEW_W / 2;
    camera.position.y = 5.1;
    state.cameraX = PAWN_SLUG_VIEW_W / 2;
  }

  function updateCamera(state, dt) {
    const bossAlive = state.enemies.some((enemy) => enemy.type === 'boss' && !enemy.dead);
    const desired = bossAlive && state.player.x > pawnSlugWorldX(PAWN_SLUG_WORLD.bossX - 570)
      ? pawnSlugWorldX(PAWN_SLUG_WORLD.bossX - 70)
      : Math.max(PAWN_SLUG_VIEW_W / 2, state.player.x + pawnSlugCameraLookAhead({
        vx: state.player.vx,
        dir: state.player.dir,
        viewWidth: PAWN_SLUG_VIEW_W,
        playerSpeed: PAWN_SLUG_PLAYER_SPEED,
      }));
    const maxCamera = pawnSlugWorldX(PAWN_SLUG_WORLD.extractionX) - PAWN_SLUG_VIEW_W / 2 + 1;
    const target = pawnSlugClamp(desired, PAWN_SLUG_VIEW_W / 2, maxCamera);
    state.cameraX += (target - state.cameraX) * (1 - Math.exp(-3.85 * dt));
    const shakeX = state.shake > 0 && !reducedMotion ? (Math.random() * 2 - 1) * state.shake : 0;
    const shakeY = state.shake > 0 && !reducedMotion ? (Math.random() * 2 - 1) * state.shake * 0.5 : 0;
    const cameraTargetY = pawnSlugPlatformCameraY(state.player.y);
    const lookAtTargetY = pawnSlugPlatformLookAtY(state.player.y);
    camera.position.x = state.cameraX + shakeX;
    camera.position.y += (cameraTargetY - camera.position.y) * (1 - Math.exp(-4.6 * dt));
    camera.position.y += shakeY;
    camera.lookAt(state.cameraX + shakeX, lookAtTargetY + shakeY * 0.5, 0);
    farEnvironment.position.x = state.cameraX * 0.58;
    state.shake = Math.max(0, state.shake - dt * 1.8);
  }

  function render() {
    renderer.render(scene, camera);
  }

  function resize() {
    const bounds = pawnSlugViewportBounds(host.clientWidth, host.clientHeight);
    renderer.setSize(bounds.width, bounds.height, false);
    camera.left = bounds.left;
    camera.right = bounds.right;
    camera.top = bounds.top;
    camera.bottom = bounds.bottom;
    camera.updateProjectionMatrix();
  }

  function destroy() {
    resetDynamic();
    scene.remove(playerModel, playerWeaponModel);
    disposePawnSlugObject(playerModel);
    disposePawnSlugSprite(playerWeaponModel);
    disposePawnSlugObject(scene);
    renderer.dispose();
    renderer.forceContextLoss?.();
    delete host.dataset.pawnSlugRuntimeHotPath;
    if (host.contains(renderer.domElement)) host.removeChild(renderer.domElement);
  }

  return {
    renderer,
    scene,
    camera,
    farEnvironment,
    dynamic,
    projectileLayer,
    fxLayer,
    playerModel,
    playerWeaponModel,
    resetDynamic,
    resetCamera,
    updateCamera,
    render,
    resize,
    destroy,
  };
}
