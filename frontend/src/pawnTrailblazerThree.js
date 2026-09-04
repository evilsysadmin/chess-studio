import * as THREE from 'three';
import { duckAmbientMusic } from './sound.js';
import { TRAIL_SPRITES } from './pawnTrailblazerSprites.js';
import { trailSpriteScale } from './pawnTrailblazerSpriteLayout.js';
import {
  TRAIL_COMBO_WINDOW_MS,
  TRAIL_LANES,
  TRAIL_POWER_DURATION_MS,
  TRAIL_PROMOTION_BONUS,
  trailBishopParryReady,
  trailBishopTargetLane,
  trailComboAfterCapture,
  trailComboMultiplier,
  trailDuelDecay,
  trailDuelDirection,
  trailDuelPress,
  trailEnemyCapturePoints,
  trailEnemyTypeForDistance,
  trailKnightJumpLane,
  trailPowerLabel,
  trailPowerLane,
  trailPromotionCrossed,
  trailSectorForDistance,
  trailSpeedForDistance,
} from './pawnTrailblazer.js';
import './components/PawnTrailblazerThree.css';

const PLAYER_Z = 4.6;
const SPAWN_Z = -31;
const COLLISION_WINDOW = 0.78;
const CAPTURE_WINDOW = 2.35;
const BISHOP_AIM_Z = -11.5;
const BISHOP_AIM_MS = 700;
const TILE_SIZE = 1.45;
const LANE_GAP = 1.45;
const TRACK_ROWS = 30;
const POWER_TYPES = ['rook', 'bishop', 'queen'];

const ENEMY_SPRITES = Object.freeze({
  pawn: TRAIL_SPRITES.enemyPawn,
  knight: TRAIL_SPRITES.enemyKnight,
  bishop: TRAIL_SPRITES.enemyBishop,
  rook: TRAIL_SPRITES.enemyRook,
});

const POWER_SPRITES = Object.freeze({
  rook: TRAIL_SPRITES.powerRook,
  bishop: TRAIL_SPRITES.powerBishop,
  queen: TRAIL_SPRITES.powerQueen,
});

function laneX(lane) {
  return (Number(lane) - (TRAIL_LANES - 1) / 2) * LANE_GAP;
}

export function createTrailGameState() {
  return {
    phase: 'ready',
    lane: 2,
    lives: 3,
    score: 0,
    distance: 0,
    speed: 5.2,
    objects: [],
    spawnIn: 5.5,
    nextId: 1,
    power: null,
    powerUntil: 0,
    duel: null,
    slashUntil: 0,
    combo: 0,
    comboUntil: 0,
    lastCaptureAt: 0,
    captures: 0,
    sectorKey: trailSectorForDistance(0).key,
    promotionRefused: false,
    promotionUntil: 0,
    toast: 'Nací peón. Siempre seré peón.',
    toastUntil: 0,
  };
}

function createArcadeMusic(kind) {
  if (typeof window === 'undefined') return () => {};
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return () => {};
  const ctx = new AudioCtx();
  const master = ctx.createGain();
  master.gain.value = 0.038;
  master.connect(ctx.destination);
  let step = 0;
  let timer = null;

  function tone(freq, duration, type = 'triangle', gainValue = 0.35) {
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    const now = ctx.currentTime + 0.02;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  }

  function tick() {
    if (kind === 'classical') {
      const line = [220, 261.63, 329.63, 392, 329.63, 293.66, 261.63, 246.94];
      tone(line[step % line.length], 0.36, 'triangle', 0.24);
      if (step % 2 === 0) tone(line[(step + 4) % line.length] / 2, 0.48, 'sine', 0.12);
    } else {
      const riff = [82.41, 82.41, 98, 110, 82.41, 123.47, 110, 98];
      tone(riff[step % riff.length], 0.18, 'sawtooth', 0.22);
      if (step % 2 === 0) tone(riff[(step + 3) % riff.length] * 2, 0.26, 'square', 0.08);
    }
    step += 1;
  }

  timer = window.setInterval(tick, kind === 'classical' ? 360 : 220);
  tick();
  return () => {
    if (timer) window.clearInterval(timer);
    try { master.disconnect(); } catch {}
    void ctx.close().catch(() => {});
  };
}

function spriteMaterial(texture = null) {
  return new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.08,
    depthTest: true,
    depthWrite: false,
  });
}

function disposeObject(object) {
  object?.traverse?.((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((material) => material?.dispose?.());
    else child.material?.dispose?.();
  });
}

function hudFromState(state, now) {
  return {
    phase: state.phase,
    lane: state.lane,
    lives: state.lives,
    score: Math.floor(state.score),
    distance: Math.floor(state.distance),
    speed: state.speed,
    power: state.power,
    powerLeft: state.power ? Math.max(0, state.powerUntil - now) : 0,
    combo: state.combo,
    captures: state.captures,
    duel: state.duel ? { ...state.duel } : null,
    sector: trailSectorForDistance(state.distance),
    promotionActive: now < state.promotionUntil,
    toast: now < state.toastUntil || state.phase === 'ready' || state.phase === 'gameover' ? state.toast : '',
  };
}

export function createPawnTrailblazerGame(host, { onReady, onHud } = {}) {
  if (!host) throw new Error('Pawn Trailblazer requires a host element');

  const coarse = Boolean(window.matchMedia?.('(pointer: coarse)')?.matches);
  const reducedMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  const renderer = new THREE.WebGLRenderer({ antialias: !coarse, alpha: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x07090d, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.25 : 1.7));
  renderer.shadowMap.enabled = !coarse;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.replaceChildren(renderer.domElement);
  host.dataset.trailSpriteLayout = 'aspect-safe-v1';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07090d);
  scene.fog = new THREE.Fog(0x07090d, 16, 42);

  const camera = new THREE.PerspectiveCamera(47, 1, 0.1, 70);
  camera.position.set(0, 5.1, 10.5);
  camera.lookAt(0, 0.45, -10.5);

  scene.add(new THREE.HemisphereLight(0xe8d8ae, 0x0b1120, 2));
  const key = new THREE.DirectionalLight(0xffdf97, 2.7);
  key.position.set(-5, 9, 6);
  key.castShadow = renderer.shadowMap.enabled;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x7c9fe4, 1.3);
  rim.position.set(6, 5, -10);
  scene.add(rim);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 70),
    new THREE.MeshStandardMaterial({ color: 0x080b10, roughness: 0.98, metalness: 0.02 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -0.08, -13);
  floor.receiveShadow = true;
  scene.add(floor);

  const trackGroup = new THREE.Group();
  scene.add(trackGroup);
  const trackTiles = [];
  const lightMaterial = new THREE.MeshStandardMaterial({ color: 0xc6b27b, roughness: 0.8, metalness: 0.02 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x3c352b, roughness: 0.82, metalness: 0.03 });
  const tileGeometry = new THREE.BoxGeometry(TILE_SIZE * 0.96, 0.11, TILE_SIZE * 0.96);
  for (let row = 0; row < TRACK_ROWS; row += 1) {
    for (let lane = 0; lane < TRAIL_LANES; lane += 1) {
      const tile = new THREE.Mesh(tileGeometry, ((row + lane) % 2 ? darkMaterial : lightMaterial).clone());
      tile.position.set(laneX(lane), 0.02, PLAYER_Z - row * TILE_SIZE);
      tile.receiveShadow = true;
      trackGroup.add(tile);
      trackTiles.push(tile);
    }
  }
  lightMaterial.dispose();
  darkMaterial.dispose();

  let destroyed = false;
  const textureLoader = new THREE.TextureLoader();
  const textures = new Map();
  const textureReadyCallbacks = new Map();

  function notifyTextureReady(url, loaded) {
    const callbacks = textureReadyCallbacks.get(url);
    if (!callbacks) return;
    textureReadyCallbacks.delete(url);
    for (const callback of callbacks) callback(loaded);
  }

  function texture(url) {
    if (textures.has(url)) return textures.get(url);
    const loaded = textureLoader.load(url, () => {
      loaded.colorSpace = THREE.SRGBColorSpace;
      loaded.needsUpdate = true;
      notifyTextureReady(url, loaded);
    });
    loaded.colorSpace = THREE.SRGBColorSpace;
    loaded.minFilter = THREE.LinearFilter;
    loaded.magFilter = THREE.LinearFilter;
    textures.set(url, loaded);
    return loaded;
  }

  function fitSprite(sprite, loaded, targetHeight, maxWidth) {
    const image = loaded?.image;
    const fitted = trailSpriteScale({
      imageWidth: image?.naturalWidth || image?.videoWidth || image?.width,
      imageHeight: image?.naturalHeight || image?.videoHeight || image?.height,
      targetHeight,
      maxWidth,
    });
    sprite.scale.set(fitted.width, fitted.height, 1);
  }

  function setSpriteArtwork(sprite, url, targetHeight, maxWidth) {
    if (!sprite?.material) return;
    const artworkToken = (sprite.userData.trailArtworkToken || 0) + 1;
    sprite.userData.trailArtworkToken = artworkToken;
    sprite.userData.trailTargetHeight = targetHeight;
    sprite.userData.trailMaxWidth = maxWidth;
    const loaded = texture(url);
    sprite.material.map = loaded;
    sprite.material.needsUpdate = true;

    const applyFit = (readyTexture) => {
      if (destroyed || sprite.userData.trailDetached || sprite.userData.trailArtworkToken !== artworkToken) return;
      fitSprite(sprite, readyTexture, targetHeight, maxWidth);
    };

    const image = loaded.image;
    if ((image?.naturalWidth || image?.videoWidth || image?.width) && (image?.naturalHeight || image?.videoHeight || image?.height)) {
      applyFit(loaded);
      return;
    }
    const callbacks = textureReadyCallbacks.get(url) || new Set();
    callbacks.add(applyFit);
    textureReadyCallbacks.set(url, callbacks);
  }

  const matthias = new THREE.Sprite(spriteMaterial());
  setSpriteArtwork(matthias, TRAIL_SPRITES.matthiasRun, 2, 1.45);
  matthias.position.set(laneX(2), 1.04, PLAYER_Z);
  matthias.renderOrder = 12;
  scene.add(matthias);

  const objectsGroup = new THREE.Group();
  const aimsGroup = new THREE.Group();
  scene.add(objectsGroup);
  scene.add(aimsGroup);

  let state = createTrailGameState();
  let targetLaneX = laneX(state.lane);
  let frame = 0;
  let previous = performance.now();
  let lastHudAt = 0;
  let stopMusic = () => {};
  let musicKind = 'synthmetal';
  let ambientDucked = false;

  function duckAmbient(enabled) {
    if (ambientDucked === enabled) return;
    ambientDucked = enabled;
    duckAmbientMusic(enabled);
  }

  function setToast(text, now, duration = 1200) {
    state.toast = text;
    state.toastUntil = now + duration;
  }

  function breakCombo() {
    state.combo = 0;
    state.comboUntil = 0;
    state.lastCaptureAt = 0;
  }

  function removeAim(item) {
    if (!item?.aimLine) return;
    aimsGroup.remove(item.aimLine);
    disposeObject(item.aimLine);
    item.aimLine = null;
  }

  function removeObject(item) {
    const index = state.objects.indexOf(item);
    if (index >= 0) state.objects.splice(index, 1);
    removeAim(item);
    if (item.mesh) {
      item.mesh.userData.trailDetached = true;
      objectsGroup.remove(item.mesh);
      disposeObject(item.mesh);
      item.mesh = null;
    }
  }

  function clearObjects() {
    for (const item of [...state.objects]) removeObject(item);
    state.objects = [];
  }

  function createObjectSprite(url, scale = 1) {
    const targetHeight = 1.65 * scale;
    const maxWidth = 1.25 * scale;
    const sprite = new THREE.Sprite(spriteMaterial());
    sprite.userData.trailDetached = false;
    setSpriteArtwork(sprite, url, targetHeight, maxWidth);
    sprite.position.y = 0.9 * scale;
    return sprite;
  }

  function createObstacle() {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.82, 0.78, 0.82),
      new THREE.MeshStandardMaterial({ color: 0x7c2f2a, emissive: 0x2b0807, emissiveIntensity: 0.22, roughness: 0.62 }),
    );
    mesh.position.y = 0.42;
    mesh.castShadow = true;
    return mesh;
  }

  function spawnObject() {
    const roll = Math.random();
    let kind = 'enemy';
    if (roll < 0.19) kind = 'power';
    else if (roll > 0.7) kind = 'obstacle';

    let lane = kind === 'power' ? state.lane : Math.floor(Math.random() * TRAIL_LANES);
    if (kind === 'obstacle' && !state.power && lane === state.lane) {
      lane = (lane + 1 + Math.floor(Math.random() * (TRAIL_LANES - 1))) % TRAIL_LANES;
    }
    if (kind === 'enemy' && Math.random() < 0.55) {
      const direction = Math.random() < 0.5 ? -1 : 1;
      lane = Math.max(0, Math.min(TRAIL_LANES - 1, state.lane + direction));
    }

    const power = kind === 'power' ? POWER_TYPES[Math.floor(Math.random() * POWER_TYPES.length)] : null;
    const enemyType = kind === 'enemy' ? trailEnemyTypeForDistance(state.distance, Math.random()) : null;
    const scale = enemyType === 'rook' ? 1.08 : enemyType === 'knight' ? 1 : 0.92;
    const mesh = kind === 'power'
      ? createObjectSprite(POWER_SPRITES[power], 0.72)
      : kind === 'enemy'
        ? createObjectSprite(ENEMY_SPRITES[enemyType] || ENEMY_SPRITES.pawn, scale)
        : createObstacle();
    mesh.position.x = laneX(lane);
    mesh.position.z = SPAWN_Z;
    objectsGroup.add(mesh);

    state.objects.push({
      id: state.nextId++,
      kind,
      lane,
      z: SPAWN_Z,
      power,
      enemyType,
      mesh,
      jumped: false,
      aimed: false,
      fired: false,
      aimLane: null,
      aimUntil: 0,
      aimLine: null,
    });
    state.spawnIn = Math.max(3.25, 4.35 + Math.random() * 3.1 - state.distance / 900);
  }

  function nearestObject(lane, kind = null) {
    return state.objects
      .filter((item) => item.lane === lane
        && item.z < PLAYER_Z + 0.2
        && item.z > PLAYER_Z - CAPTURE_WINDOW
        && (!kind || item.kind === kind))
      .sort((a, b) => b.z - a.z)[0] || null;
  }

  function emitHud(now, force = false) {
    if (!force && now - lastHudAt < 90) return;
    lastHudAt = now;
    onHud?.(hudFromState(state, now));
  }

  function startGame(now = performance.now()) {
    duckAmbient(false);
    stopMusic();
    stopMusic = () => {};
    clearObjects();
    state = createTrailGameState();
    state.phase = 'running';
    state.toast = 'Vorwärts.';
    state.toastUntil = now + 1100;
    targetLaneX = laneX(state.lane);
    setSpriteArtwork(matthias, TRAIL_SPRITES.matthiasRun, 2, 1.45);
    duckAmbient(true);
    stopMusic = createArcadeMusic(musicKind);
    emitHud(now, true);
  }

  function endGame(now) {
    state.phase = 'gameover';
    state.duel = null;
    state.toast = 'Fin de maniobras. Otra vez.';
    state.toastUntil = now + 1600;
    duckAmbient(false);
    stopMusic();
    stopMusic = () => {};
    emitHud(now, true);
  }

  function loseLife(now, message) {
    state.lives -= 1;
    state.duel = null;
    breakCombo();
    state.phase = state.lives <= 0 ? 'gameover' : 'running';
    setToast(state.lives <= 0 ? 'Fin de maniobras. Otra vez.' : message, now, 1600);
    if (state.phase === 'gameover') endGame(now);
    emitHud(now, true);
  }

  function finishCapture(enemy, targetLane, now, points = trailEnemyCapturePoints(enemy?.enemyType)) {
    removeObject(enemy);
    state.lane = targetLane;
    targetLaneX = laneX(targetLane);
    state.combo = trailComboAfterCapture(state.combo, state.lastCaptureAt, now);
    state.lastCaptureAt = now;
    state.comboUntil = now + TRAIL_COMBO_WINDOW_MS;
    state.captures += 1;
    const awarded = Math.round(points * trailComboMultiplier(state.combo));
    state.score += awarded;
    state.slashUntil = now + 380;
    state.duel = null;
    state.phase = 'running';
    setSpriteArtwork(matthias, TRAIL_SPRITES.matthiasCapture, 2, 1.45);
    setToast(state.combo > 1 ? `COMBO x${state.combo} · +${awarded}` : `Captura · +${awarded}`, now, 1050);
    emitHud(now, true);
  }

  function createBishopAim(item) {
    removeAim(item);
    const points = [
      new THREE.Vector3(laneX(item.lane), 0.34, item.z),
      new THREE.Vector3(laneX(item.aimLane), 0.18, PLAYER_Z),
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineDashedMaterial({ color: 0xf1c75b, dashSize: 0.38, gapSize: 0.2, transparent: true, opacity: 0.78 });
    const line = new THREE.Line(geometry, material);
    line.computeLineDistances();
    aimsGroup.add(line);
    item.aimLine = line;
  }

  function control(input) {
    const now = performance.now();
    if (state.phase === 'ready' || state.phase === 'gameover') {
      if (input === 'action') startGame(now);
      return;
    }

    if (state.phase === 'running' && input === 'action') {
      const sniper = state.objects.find((item) => (
        item.kind === 'enemy'
        && item.enemyType === 'bishop'
        && item.aimed
        && !item.fired
        && item.aimLane === state.lane
      ));
      if (sniper && trailBishopParryReady(sniper.aimUntil, now)) {
        sniper.fired = true;
        removeAim(sniper);
        state.score += 120;
        state.slashUntil = now + 360;
        setSpriteArtwork(matthias, TRAIL_SPRITES.matthiasCapture, 2, 1.45);
        setToast('PARADA · +120. Nein.', now, 900);
        emitHud(now, true);
      } else if (sniper) {
        setToast('Aún no. Espera el destello del alfil.', now, 700);
        emitHud(now, true);
      }
      return;
    }

    if (state.phase === 'duel' && state.duel) {
      if (input === 'left') state.duel.direction = trailDuelDirection(state.lane, -1);
      else if (input === 'right') state.duel.direction = trailDuelDirection(state.lane, 1);
      else if (input === 'action') {
        state.duel.meter = trailDuelPress(state.duel.meter);
        if (state.duel.meter >= 100) {
          const enemy = state.objects.find((item) => item.id === state.duel.enemyId);
          if (enemy) {
            const direction = trailDuelDirection(state.lane, state.duel.direction);
            finishCapture(enemy, state.lane + direction, now);
          }
        }
      }
      emitHud(now, true);
      return;
    }

    if (state.phase !== 'running' || (input !== 'left' && input !== 'right')) return;
    const direction = input === 'left' ? -1 : 1;
    const targetLane = state.lane + direction;
    if (targetLane < 0 || targetLane >= TRAIL_LANES) return;

    if (state.power) {
      const nextLane = trailPowerLane({ lane: state.lane, direction, power: state.power });
      const victim = nearestObject(nextLane);
      if (victim && (state.power === 'bishop' || state.power === 'queen')) {
        if (victim.kind === 'enemy') finishCapture(victim, nextLane, now);
        else {
          removeObject(victim);
          state.score += 70;
          state.slashUntil = now + 250;
          state.lane = nextLane;
          targetLaneX = laneX(nextLane);
          emitHud(now, true);
        }
        return;
      }
      state.lane = nextLane;
      targetLaneX = laneX(nextLane);
      emitHud(now, true);
      return;
    }

    const enemy = nearestObject(targetLane, 'enemy');
    if (enemy) finishCapture(enemy, targetLane, now);
    else {
      setToast('Nein. Un peón no se mueve de lado.', now, 900);
      emitHud(now, true);
    }
  }

  function keydown(event) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      control('left');
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      control('right');
    } else if (event.code === 'Space' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      control('action');
    }
  }
  window.addEventListener('keydown', keydown, { passive: false });

  function updateRunning(now, dt) {
    const previousDistance = state.distance;
    state.speed = trailSpeedForDistance(state.distance);
    state.distance += state.speed * dt;
    state.score += state.speed * dt * 2;

    const sector = trailSectorForDistance(state.distance);
    if (sector.key !== state.sectorKey) {
      state.sectorKey = sector.key;
      setToast(`SECTOR ${sector.code} · ${sector.name} · ${sector.toast}`, now, 1600);
    }
    if (trailPromotionCrossed(previousDistance, state.distance, state.promotionRefused)) {
      state.promotionRefused = true;
      state.promotionUntil = now + 1900;
      state.score += TRAIL_PROMOTION_BONUS;
      setToast(`PROMOCIÓN A DAMA · RECHAZADA. +${TRAIL_PROMOTION_BONUS}`, now, 1900);
    }

    if (state.power && now >= state.powerUntil) state.power = null;
    if (state.combo && now >= state.comboUntil) breakCombo();
    if (state.slashUntil && now >= state.slashUntil) {
      state.slashUntil = 0;
      setSpriteArtwork(matthias, TRAIL_SPRITES.matthiasRun, 2, 1.45);
    }

    state.spawnIn -= state.speed * dt;
    if (state.spawnIn <= 0) spawnObject();

    for (const item of [...state.objects]) {
      item.z += state.speed * dt;

      if (item.kind === 'enemy' && item.enemyType === 'knight' && !item.jumped && item.z > -7.8) {
        item.lane = trailKnightJumpLane(item.lane, state.lane);
        item.jumped = true;
      }

      if (item.kind === 'enemy' && item.enemyType === 'bishop' && !item.aimed && item.z > BISHOP_AIM_Z) {
        item.aimed = true;
        item.aimLane = trailBishopTargetLane(item.lane, state.lane);
        item.aimUntil = now + BISHOP_AIM_MS;
        createBishopAim(item);
        setToast('ALFIL · diagonal marcada. Muévete o para el disparo.', now, 900);
      } else if (item.kind === 'enemy' && item.enemyType === 'bishop' && item.aimed && !item.fired && now >= item.aimUntil) {
        item.fired = true;
        removeAim(item);
        if (state.lane === item.aimLane) {
          loseLife(now, 'El alfil te ha cosido en diagonal. Eso sí estaba anunciado.');
          if (state.phase !== 'running') return;
        } else {
          setToast('El disparo del alfil ha pasado de largo.', now, 850);
        }
      }

      item.mesh.position.x += (laneX(item.lane) - item.mesh.position.x) * Math.min(1, dt * 8);
      item.mesh.position.z = item.z;
      if (item.kind === 'power') {
        item.mesh.position.y = 0.78 + Math.sin(now / 180 + item.id) * 0.09;
        item.mesh.material.rotation = now / 900;
      } else if (item.kind === 'enemy' && item.enemyType === 'knight') {
        item.mesh.position.y = 0.94 + Math.abs(Math.sin(now / 230 + item.id)) * 0.2;
      } else if (item.kind === 'enemy') {
        item.mesh.position.y = 0.9 + Math.abs(Math.sin(now / 310 + item.id)) * 0.05;
      }
      if (item.aimLine) createBishopAim(item);

      if (item.z > PLAYER_Z + 2.2) removeObject(item);
    }

    if (state.phase !== 'running') return;

    for (const item of [...state.objects].sort((a, b) => b.z - a.z)) {
      if (item.z < PLAYER_Z - COLLISION_WINDOW || item.z > PLAYER_Z + COLLISION_WINDOW || item.lane !== state.lane) continue;
      if (item.kind === 'power') {
        state.power = item.power;
        state.powerUntil = now + TRAIL_POWER_DURATION_MS;
        state.score += 80;
        removeObject(item);
        setToast(`${trailPowerLabel(item.power)} · movimiento desbloqueado`, now, 1400);
      } else if (item.kind === 'enemy' && item.enemyType === 'pawn') {
        state.phase = 'duel';
        state.duel = {
          enemyId: item.id,
          meter: 24,
          timeLeft: 2.6,
          direction: state.lane === TRAIL_LANES - 1 ? -1 : 1,
        };
        setSpriteArtwork(
          item.mesh,
          TRAIL_SPRITES.enemyDuelist,
          item.mesh.userData.trailTargetHeight || 1.65,
          item.mesh.userData.trailMaxWidth || 1.25,
        );
        item.z = PLAYER_Z - 0.18;
        setToast('¡FRONTAL! Machaca ESPACIO.', now, 1000);
        emitHud(now, true);
        break;
      } else if (item.kind === 'enemy' && item.enemyType === 'knight') {
        removeObject(item);
        loseLife(now, 'El caballo ha saltado sobre tu línea. Previsible después de verlo.');
        break;
      } else if (item.kind === 'enemy' && item.enemyType === 'bishop') {
        removeObject(item);
        loseLife(now, 'El alfil ha cerrado la diagonal. Muy litúrgico todo.');
        break;
      } else if (item.kind === 'enemy' && item.enemyType === 'rook') {
        removeObject(item);
        loseLife(now, 'Una torre de frente. Ni siquiera tú eres tan cabezón, Matthias.');
        break;
      } else {
        removeObject(item);
        loseLife(now, 'Eso era un obstáculo, general.');
        break;
      }
    }
  }

  function updateDuel(now, dt) {
    if (!state.duel) return;
    state.duel.meter = trailDuelDecay(state.duel.meter, dt);
    state.duel.timeLeft -= dt;
    const item = state.objects.find((candidate) => candidate.id === state.duel?.enemyId);
    if (item) {
      item.z = PLAYER_Z - 0.18;
      item.mesh.position.z = item.z;
      item.mesh.position.x = laneX(state.lane) + state.duel.direction * 0.46;
      item.mesh.position.y = 0.92 + Math.sin(now / 85) * 0.04;
    }
    if (state.duel.timeLeft <= 0) {
      if (item) removeObject(item);
      loseLife(now, 'El otro peón te ha echado para atrás. Vergüenza administrativa.');
    }
  }

  function resize() {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(host);

  function render(now) {
    if (destroyed) return;
    const dt = Math.min(0.05, Math.max(0, (now - previous) / 1000));
    previous = now;

    if (state.phase === 'running') updateRunning(now, dt);
    else if (state.phase === 'duel') updateDuel(now, dt);

    const trackAdvance = state.phase === 'running' ? state.speed * dt : 0;
    if (trackAdvance) {
      for (const tile of trackTiles) {
        tile.position.z += trackAdvance;
        if (tile.position.z > PLAYER_Z + TILE_SIZE) tile.position.z -= TRACK_ROWS * TILE_SIZE;
      }
    }

    const laneEase = reducedMotion ? 1 : Math.min(1, dt * 12);
    matthias.position.x += (targetLaneX - matthias.position.x) * laneEase;
    const runPulse = state.phase === 'running' ? Math.sin(now / 70) : Math.sin(now / 180);
    matthias.position.y = 1.04 + Math.abs(runPulse) * (reducedMotion ? 0.025 : 0.09);
    matthias.material.rotation = reducedMotion ? 0 : runPulse * 0.025;

    camera.position.x += (matthias.position.x * 0.08 - camera.position.x) * Math.min(1, dt * 4);
    camera.lookAt(matthias.position.x * 0.08, 0.35, -10.5);

    renderer.render(scene, camera);
    emitHud(now);
    frame = requestAnimationFrame(render);
  }
  frame = requestAnimationFrame(render);
  onReady?.(`THREE.JS · WebGL${renderer.capabilities.isWebGL2 ? '2' : '1'}`);
  emitHud(performance.now(), true);

  return {
    input: control,
    setMusic(next) {
      if (!['synthmetal', 'classical'].includes(next)) return;
      musicKind = next;
      if (state.phase === 'running' || state.phase === 'duel') {
        stopMusic();
        stopMusic = createArcadeMusic(musicKind);
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('keydown', keydown);
      stopMusic();
      duckAmbient(false);
      clearObjects();
      textureReadyCallbacks.clear();
      scene.remove(matthias);
      matthias.material.dispose();
      disposeObject(scene);
      for (const value of textures.values()) value.dispose?.();
      textures.clear();
      renderer.dispose();
      renderer.forceContextLoss?.();
      delete host.dataset.trailSpriteLayout;
      if (host.contains(renderer.domElement)) host.removeChild(renderer.domElement);
    },
  };
}
