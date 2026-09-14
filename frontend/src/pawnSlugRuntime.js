import { duckAmbientMusic } from './sound.js';
import { PAWN_SLUG_WORLD, pawnSlugMatthiasLine } from './pawnSlug.js';
import {
  createPawnSlugInitialState,
  createPawnSlugInputState,
  pawnSlugClamp,
  pawnSlugWorldX,
  resetPawnSlugInput,
} from './pawnSlugRuntimeCore.js';
import { pawnSlugRuntimeHud } from './pawnSlugRuntimeHud.js';
import { createPawnSlugRuntimeInputController } from './pawnSlugRuntimeInput.js';
import { createPawnSlugRuntimeSfx } from './pawnSlugRuntimeSfx.js';
import { createPawnSlugRuntimeView } from './pawnSlugRuntimeView.js';
import { createPawnSlugWeaponSystem } from './pawnSlugRuntimeWeapons.js';
import { createPawnSlugCombatSystem } from './pawnSlugRuntimeCombat.js';
import { createPawnSlugEnemySystem } from './pawnSlugRuntimeEnemies.js';
import { createPawnSlugPlayerSystem } from './pawnSlugRuntimePlayer.js';

export function createPawnSlugRuntime(host, { onReady, onHud } = {}) {
  if (!host) throw new Error('Pawn Slug requires a host element');

  const coarse = Boolean(window.matchMedia?.('(pointer: coarse)')?.matches);
  const reducedMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  const view = createPawnSlugRuntimeView(host, { coarse, reducedMotion });
  const {
    renderer,
    dynamic,
    projectileLayer,
    fxLayer,
    playerModel,
    playerWeaponModel,
  } = view;

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
    view,
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

  function frameLoopActive() {
    return !destroyed && visible && inViewport && !paused;
  }

  function scheduleFrame() {
    if (!frameLoopActive() || frame) return;
    frame = window.requestAnimationFrame(loop);
  }

  function syncFrameLoop() {
    previous = performance.now();
    if (!frameLoopActive()) {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      return;
    }
    scheduleFrame();
  }

  function startMission() {
    const bankedCredits = Math.max(0, Math.floor(runtime.state.credits || 0));
    const rescuedPows = new Set(runtime.state.rescuedPows || []);
    const destroyedDestructibles = new Set(runtime.state.destroyedDestructibles || []);
    view.resetDynamic();
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
    view.resetCamera(runtime.state);
    setAmbientDuck(true);
    emitHud(true);
    syncFrameLoop();
  }

  const inputController = createPawnSlugRuntimeInputController(runtime, { startMission });

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
    view.updateCamera(state, dt);
    runtime.combat.checkVictory();
  }

  function onVisibility() {
    visible = document.visibilityState !== 'hidden';
    syncFrameLoop();
  }

  const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(view.resize) : null;
  resizeObserver?.observe(host);
  const intersectionObserver = typeof IntersectionObserver !== 'undefined'
    ? new IntersectionObserver((entries) => {
      inViewport = Boolean(entries[0]?.isIntersecting);
      syncFrameLoop();
    }, { threshold: 0.01 })
    : null;
  intersectionObserver?.observe(host);
  inputController.attach();
  document.addEventListener('visibilitychange', onVisibility);
  view.resize();
  runtime.player.placePlayer();
  emitHud(true);
  onReady?.(`THREE.JS · ${renderer.capabilities.isWebGL2 ? 'WEBGL2' : 'WEBGL1'}${coarse ? ' · MOBILE' : ''}`);

  function loop(now) {
    frame = 0;
    if (!frameLoopActive()) return;
    const dt = pawnSlugClamp((now - previous) / 1000, 0, 0.04);
    previous = now;
    update(dt);
    view.render();
    emitHud();
    scheduleFrame();
  }
  syncFrameLoop();

  return {
    input(action, pressed = true) {
      inputController.input(action, pressed);
    },
    setPaused(value) {
      paused = Boolean(value);
      resetPawnSlugInput(runtime.input);
      syncFrameLoop();
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
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      inputController.destroy();
      document.removeEventListener('visibilitychange', onVisibility);
      setAmbientDuck(false);
      runtime.sfx.destroy();
      view.destroy();
    },
  };
}
