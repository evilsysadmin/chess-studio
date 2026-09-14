import * as THREE from 'three';
import { duckAmbientMusic } from './sound.js';
import { PAWN_SLUG_WORLD, pawnSlugMatthiasLine } from './pawnSlug.js';
import { pawnSlugCameraLookAhead } from './pawnSlugCamera.js';
import { createMatthiasSlugModel, createSlugEnvironment, disposePawnSlugObject } from './pawnSlugArt.js';
import { createPawnSlugPremiumLandmarks } from './pawnSlugLandmarks.js';
import {
  createPawnSlugPlatforms,
  pawnSlugPlatformCameraY,
  pawnSlugPlatformLookAtY,
} from './pawnSlugPlatforms.js';
import { createWeaponSprite, disposePawnSlugSprite } from './pawnSlugSprites.js';
import { PAWN_SLUG_RUNTIME_HOT_PATH } from './pawnSlugRuntimeHotPath.js';
import {
  PAWN_SLUG_PLAYER_SPEED,
  PAWN_SLUG_VIEW_H,
  PAWN_SLUG_VIEW_W,
  createPawnSlugInitialState,
  createPawnSlugInputState,
  pawnSlugClamp,
  pawnSlugKeyAction,
  pawnSlugWorldX,
  resetPawnSlugInput,
} from './pawnSlugRuntimeCore.js';
import { pawnSlugRuntimeHud } from './pawnSlugRuntimeHud.js';
import { createPawnSlugRuntimeSfx } from './pawnSlugRuntimeSfx.js';
import { createPawnSlugWeaponSystem } from './pawnSlugRuntimeWeapons.js';
import { createPawnSlugCombatSystem } from './pawnSlugRuntimeCombat.js';
import { createPawnSlugEnemySystem } from './pawnSlugRuntimeEnemies.js';
import { createPawnSlugPlayerSystem } from './pawnSlugRuntimePlayer.js';

export function createPawnSlugRuntime(host, { onReady, onHud } = {}) {
  if (!host) throw new Error('Pawn Slug requires a host element');

  const coarse = Boolean(window.matchMedia?.('(pointer: coarse)')?.matches);
  const reducedMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
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

  const camera = new THREE.OrthographicCamera(-PAWN_SLUG_VIEW_W / 2, PAWN_SLUG_VIEW_W / 2, PAWN_SLUG_VIEW_H / 2, -PAWN_SLUG_VIEW_H / 2, 0.1, 80);
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
  const playerWeaponModel = createWeaponSprite('pistol');
  playerWeaponModel.name = 'pawn-slug-player-weapon';
  scene.add(playerModel, playerWeaponModel);

  let destroyed = false;
  let visible = document.visibilityState !== 'hidden';
  let inViewport = true;
  let paused = false;
  let frame = 0;
  let previous = performance.now();
  let lastHudAt = 0;
  let ambientDucked = false;

  const runtime = {
    state: createPawnSlugInitialState({ startToast: pawnSlugMatthiasLine('start') }),
    input: createPawnSlugInputState(),
    coarse,
    reducedMotion,
    renderer,
    scene,
    camera,
    farEnvironment,
    dynamic,
    projectileLayer,
    fxLayer,
    playerModel,
    playerWeaponModel,
    world: PAWN_SLUG_WORLD,
    worldX: pawnSlugWorldX,
    matthiasLine: pawnSlugMatthiasLine,
    sfx: createPawnSlugRuntimeSfx(),
    emitHud: null,
    setToast: null,
    setAmbientDuck: null,
    weapons: null,
    combat: null,
    enemies: null,
    player: null,
  };

  function setAmbientDuck(enabled) {
    if (ambientDucked === enabled) return;
    ambientDucked = enabled;
    duckAmbientMusic(enabled);
  }

  function emitHud(force = false) {
    const now = performance.now();
    if (!force && now - lastHudAt < 90) return;
    lastHudAt = now;
    onHud?.(pawnSlugRuntimeHud(runtime.state));
  }

  function setToast(text, seconds = 2.4) {
    runtime.state.toast = text;
    runtime.state.toastUntil = runtime.state.time + seconds;
    emitHud(true);
  }

  runtime.emitHud = emitHud;
  runtime.setToast = setToast;
  runtime.setAmbientDuck = setAmbientDuck;
  runtime.weapons = createPawnSlugWeaponSystem(runtime);
  runtime.combat = createPawnSlugCombatSystem(runtime);
  runtime.enemies = createPawnSlugEnemySystem(runtime);
  runtime.player = createPawnSlugPlayerSystem(runtime);

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

  function startMission() {
    const bankedCredits = Math.max(0, Math.floor(runtime.state.credits || 0));
    const rescuedPows = new Set(runtime.state.rescuedPows || []);
    const destroyedDestructibles = new Set(runtime.state.destroyedDestructibles || []);
    resetDynamic();
    resetPawnSlugInput(runtime.input);
    paused = false;
    runtime.state = createPawnSlugInitialState({ startToast: pawnSlugMatthiasLine('start') });
    runtime.state.credits = bankedCredits;
    runtime.state.rescuedPows = rescuedPows;
    runtime.state.destroyedDestructibles = destroyedDestructibles;
    runtime.state.phase = 'playing';
    runtime.state.toastUntil = 3.5;
    playerModel.userData.setWeapon?.('pistol');
    runtime.weapons.syncPlayerWeaponVisual('pistol');
    runtime.player.placePlayer();
    camera.position.x = PAWN_SLUG_VIEW_W / 2;
    camera.position.y = 5.1;
    runtime.state.cameraX = PAWN_SLUG_VIEW_W / 2;
    setAmbientDuck(true);
    emitHud(true);
  }

  function updateCamera(dt) {
    const state = runtime.state;
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

  function update(dt) {
    if (paused) return;
    const state = runtime.state;
    state.time += dt;
    if (state.phase !== 'playing') return;
    if (state.hitStop > 0) {
      state.hitStop = Math.max(0, state.hitStop - dt);
      runtime.combat.updateFx(dt);
      return;
    }
    state.missionTime += dt;
    if (state.combo && state.time > state.comboUntil) state.combo = 0;
    runtime.enemies.spawnAhead();
    runtime.player.updatePlayer(dt);
    runtime.combat.updatePows();
    runtime.enemies.updateEnemies(dt);
    runtime.combat.updateBullets(dt);
    runtime.combat.updateGrenades(dt);
    runtime.combat.updateDestructibles();
    runtime.combat.updatePickups(dt);
    runtime.combat.updateFx(dt);
    updateCamera(dt);
    runtime.combat.checkVictory();
  }

  function render() {
    renderer.render(scene, camera);
  }

  function resize() {
    const width = Math.max(1, host.clientWidth || 1);
    const height = Math.max(1, host.clientHeight || 1);
    renderer.setSize(width, height, false);
    const aspect = width / height;
    const targetAspect = PAWN_SLUG_VIEW_W / PAWN_SLUG_VIEW_H;
    if (aspect >= targetAspect) {
      const extra = aspect / targetAspect;
      camera.left = -(PAWN_SLUG_VIEW_W * extra) / 2;
      camera.right = (PAWN_SLUG_VIEW_W * extra) / 2;
      camera.top = PAWN_SLUG_VIEW_H / 2;
      camera.bottom = -PAWN_SLUG_VIEW_H / 2;
    } else {
      const extra = targetAspect / aspect;
      camera.left = -PAWN_SLUG_VIEW_W / 2;
      camera.right = PAWN_SLUG_VIEW_W / 2;
      camera.top = (PAWN_SLUG_VIEW_H * extra) / 2;
      camera.bottom = -(PAWN_SLUG_VIEW_H * extra) / 2;
    }
    camera.updateProjectionMatrix();
  }

  function setInput(action, pressed = true) {
    if (action === 'action') {
      if (pressed && ['ready', 'gameover', 'victory'].includes(runtime.state.phase)) startMission();
      return;
    }
    if (action === 'weapon-prev') {
      if (pressed) runtime.weapons.cycleWeapon(-1);
      return;
    }
    if (action === 'weapon-next') {
      if (pressed) runtime.weapons.cycleWeapon(1);
      return;
    }
    if (action.startsWith('weapon:')) {
      if (pressed) runtime.weapons.selectWeapon(action.slice('weapon:'.length));
      return;
    }
    if (action === 'fire') {
      const next = Boolean(pressed);
      if (next && !runtime.input.fire) runtime.input.firePressed = true;
      runtime.input.fire = next;
      return;
    }
    if (!(action in runtime.input)) return;
    runtime.input[action] = Boolean(pressed);
  }

  function onKeyDown(event) {
    const action = pawnSlugKeyAction(event);
    if (!action) return;
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(event.key.toLowerCase())) event.preventDefault();
    if (event.repeat && action.startsWith('weapon')) return;
    if (['ready', 'gameover', 'victory'].includes(runtime.state.phase)) {
      if (action === 'fire' || action === 'jump') startMission();
      return;
    }
    setInput(action, true);
  }

  function onKeyUp(event) {
    const action = pawnSlugKeyAction(event);
    if (action) setInput(action, false);
  }

  function onVisibility() {
    visible = document.visibilityState !== 'hidden';
    previous = performance.now();
  }

  const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  resizeObserver?.observe(host);
  const intersectionObserver = typeof IntersectionObserver !== 'undefined'
    ? new IntersectionObserver((entries) => { inViewport = Boolean(entries[0]?.isIntersecting); previous = performance.now(); }, { threshold: 0.01 })
    : null;
  intersectionObserver?.observe(host);
  window.addEventListener('keydown', onKeyDown, { passive: false });
  window.addEventListener('keyup', onKeyUp);
  document.addEventListener('visibilitychange', onVisibility);
  resize();
  runtime.player.placePlayer();
  emitHud(true);
  onReady?.(`THREE.JS · ${renderer.capabilities.isWebGL2 ? 'WEBGL2' : 'WEBGL1'}${coarse ? ' · MOBILE' : ''}`);

  function loop(now) {
    if (destroyed) return;
    frame = window.requestAnimationFrame(loop);
    const dt = pawnSlugClamp((now - previous) / 1000, 0, 0.04);
    previous = now;
    if (!visible || !inViewport) return;
    update(dt);
    render();
    emitHud();
  }
  frame = window.requestAnimationFrame(loop);

  return {
    input(action, pressed = true) {
      setInput(action, pressed);
    },
    setPaused(value) {
      paused = Boolean(value);
      resetPawnSlugInput(runtime.input);
      previous = performance.now();
    },
    setAudioMix({ sfxVolume } = {}) {
      if (sfxVolume != null) runtime.sfx.setVolume(sfxVolume);
    },
    restart() {
      startMission();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('visibilitychange', onVisibility);
      setAmbientDuck(false);
      runtime.sfx.destroy();
      resetDynamic();
      scene.remove(playerModel, playerWeaponModel);
      disposePawnSlugObject(playerModel);
      disposePawnSlugSprite(playerWeaponModel);
      disposePawnSlugObject(scene);
      renderer.dispose();
      renderer.forceContextLoss?.();
      delete host.dataset.pawnSlugRuntimeHotPath;
      if (host.contains(renderer.domElement)) host.removeChild(renderer.domElement);
    },
  };
}
