import * as THREE from 'three';
import { duckAmbientMusic } from './sound.js';
import { TRAIL_SPRITES } from './pawnTrailblazerSprites.js';
import {
  TRAIL_COMBO_WINDOW_MS,
  TRAIL_LANES,
  TRAIL_POWER_DURATION_MS,
  TRAIL_PROMOTION_BONUS,
  trailComboAfterCapture,
  trailComboMultiplier,
  trailDuelDecay,
  trailDuelDirection,
  trailDuelPress,
  trailEnemyCapturePoints,
  trailEnemyTypeForDistance,
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
    spawnIn: 4.8,
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
      const bass = [73.42, 73.42, 87.31, 65.41, 73.42, 98, 87.31, 65.41];
      tone(bass[step % bass.length], 0.18, step % 2 ? 'sawtooth' : 'square', 0.19);
      if (step % 4 === 0) tone(bass[step % bass.length] * 4, 0.08, 'square', 0.07);
    }
    step += 1;
  }

  timer = window.setInterval(tick, kind === 'classical' ? 360 : 190);
  tick();
  return () => {
    if (timer) window.clearInterval(timer);
    try { master.disconnect(); } catch {}
    void ctx.close().catch(() => {});
  };
}

function spriteMaterial(texture) {
  return new THREE.SpriteMaterial({ map: texture, transparent: true, alphaTest: 0.06, depthWrite: true });
}

function disposeObject(object) {
  object?.traverse?.((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((material) => material?.dispose?.());
    else child.material?.dispose?.();
  });
}

function hudFromState(state, now) {
  const powerLeft = state.power ? Math.max(0, state.powerUntil - now) : 0;
  return {
    phase: state.phase,
    lane: state.lane,
    lives: state.lives,
    score: Math.round(state.score),
    distance: Math.floor(state.distance),
    speed: state.speed,
    power: state.power,
    powerLeft,
    combo: state.combo,
    captures: state.captures,
    duel: state.duel ? { ...state.duel } : null,
    sector: trailSectorForDistance(state.distance),
    promotionActive: state.promotionUntil > now,
    toast: state.toastUntil > now ? state.toast : '',
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

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07090d);
  scene.fog = new THREE.Fog(0x07090d, 16, 42);

  const camera = new THREE.PerspectiveCamera(47, 1, 0.1, 70);
  camera.position.set(0, 5.1, 10.5);
  camera.lookAt(0, 0.45, -10.5);

  scene.add(new THREE.HemisphereLight(0xe8d8ae, 0x0b1120, 2.0));
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

  const textureLoader = new THREE.TextureLoader();
  const textures = new Map();
  function texture(url) {
    if (textures.has(url)) return textures.get(url);
    const loaded = textureLoader.load(url, () => {
      loaded.colorSpace = THREE.SRGBColorSpace;
      loaded.needsUpdate = true;
    });
    loaded.colorSpace = THREE.SRGBColorSpace;
    loaded.minFilter = THREE.LinearFilter;
    loaded.magFilter = THREE.LinearFilter;
    textures.set(url, loaded);
    return loaded;
  }

  const matthias = new THREE.Sprite(spriteMaterial(texture(TRAIL_SPRITES.matthiasRun)));
  matthias.scale.set(1.45, 2.0, 1);
  matthias.position.set(laneX(2), 1.04, PLAYER_Z);
  matthias.renderOrder = 12;
  scene.add(matthias);

  const objectsGroup = new THREE.Group();
  scene.add(objectsGroup);

  let state = createTrailGameState();
  let targetLaneX = laneX(state.lane);
  let destroyed = false;
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

  function setToast(text, now, duration = 1400) {
    state.toast = text;
    state.toastUntil = now + duration;
  }

  function removeObject(item) {
    const index = state.objects.indexOf(item);
    if (index >= 0) state.objects.splice(index, 1);
    if (item.mesh) {
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
    const sprite = new THREE.Sprite(spriteMaterial(texture(url)));
    sprite.scale.set(1.25 * scale, 1.65 * scale, 1);
    sprite.position.y = 0.9 * scale;
    return sprite;
  }

  function spawnObject() {
    const powerRoll = Math.random();
    if (powerRoll < 0.115) {
      const power = POWER_TYPES[Math.floor(Math.random() * POWER_TYPES.length)];
      const lane = Math.floor(Math.random() * TRAIL_LANES);
      const mesh = createObjectSprite(POWER_SPRITES[power], 0.72);
      mesh.position.set(laneX(lane), 0.72, SPAWN_Z);
      objectsGroup.add(mesh);
      state.objects.push({ id: state.nextId++, kind: 'power', power, lane, z: SPAWN_Z, mesh });
      return;
    }

    const enemyType = trailEnemyTypeForDistance(state.distance, Math.random());
    const lane = Math.floor(Math.random() * TRAIL_LANES);
    const scale = enemyType === 'rook' ? 1.08 : enemyType === 'knight' ? 1.0 : 0.92;
    const mesh = createObjectSprite(ENEMY_SPRITES[enemyType] || ENEMY_SPRITES.pawn, scale);
    mesh.position.set(laneX(lane), 0.9 * scale, SPAWN_Z);
    objectsGroup.add(mesh);
    state.objects.push({ id: state.nextId++, kind: 'enemy', enemyType, lane, z: SPAWN_Z, mesh, hopped: false });
  }

  function startGame(now = performance.now()) {
    clearObjects();
    state = createTrailGameState();
    state.phase = 'running';
    state.toast = 'Vorwärts. Y no hagas el ridículo.';
    state.toastUntil = now + 1600;
    targetLaneX = laneX(state.lane);
    matthias.material.map = texture(TRAIL_SPRITES.matthiasRun);
    matthias.material.needsUpdate = true;
    duckAmbient(true);
    stopMusic();
    stopMusic = createArcadeMusic(musicKind);
    emitHud(now, true);
  }

  function endGame(now) {
    state.phase = 'gameover';
    state.duel = null;
    setToast('Maniobras terminadas.', now, 2000);
    duckAmbient(false);
    stopMusic();
    stopMusic = () => {};
    emitHud(now, true);
  }

  function damage(now, reason) {
    state.lives = Math.max(0, state.lives - 1);
    state.combo = 0;
    state.comboUntil = 0;
    setToast(reason, now, 1250);
    if (state.lives <= 0) endGame(now);
  }

  function capture(item, now) {
    state.combo = trailComboAfterCapture(state.combo, state.lastCaptureAt, now);
    state.lastCaptureAt = now;
    state.comboUntil = now + TRAIL_COMBO_WINDOW_MS;
    state.captures += 1;
    const points = trailEnemyCapturePoints(item.enemyType) * trailComboMultiplier(state.combo);
    state.score += points;
    state.slashUntil = now + 250;
    matthias.material.map = texture(TRAIL_SPRITES.matthiasCapture);
    matthias.material.needsUpdate = true;
    setToast(`${String(item.enemyType || 'pawn').toUpperCase()} capturado · +${Math.round(points)}`, now, 900);
    removeObject(item);
  }

  function collectPower(item, now) {
    state.power = item.power;
    state.powerUntil = now + TRAIL_POWER_DURATION_MS;
    setToast(`${trailPowerLabel(item.power)} · movimiento temporal desbloqueado`, now, 1300);
    state.score += 120;
    removeObject(item);
  }

  function beginDuel(item, now) {
    state.phase = 'duel';
    state.duel = { enemyId: item.id, meter: 12, direction: trailDuelDirection(state.lane, Math.random() < 0.5 ? -1 : 1) };
    item.mesh.material.map = texture(TRAIL_SPRITES.enemyDuelist);
    item.mesh.material.needsUpdate = true;
    item.z = PLAYER_Z - 0.18;
    setToast('PEÓN ENFRENTE · ESPACIO, SOLDADO.', now, 1100);
  }

  function winDuel(now) {
    const item = state.objects.find((candidate) => candidate.id === state.duel?.enemyId);
    const direction = state.duel?.direction || 1;
    if (item) capture(item, now);
    state.lane = Math.max(0, Math.min(TRAIL_LANES - 1, state.lane + direction));
    targetLaneX = laneX(state.lane);
    state.duel = null;
    state.phase = 'running';
  }

  function tryCaptureInLane(targetLane, now) {
    const candidate = state.objects
      .filter((item) => item.kind === 'enemy' && item.lane === targetLane && Math.abs(item.z - PLAYER_Z) <= CAPTURE_WINDOW)
      .sort((a, b) => Math.abs(a.z - PLAYER_Z) - Math.abs(b.z - PLAYER_Z))[0];
    if (!candidate) return false;
    capture(candidate, now);
    return true;
  }

  function control(input) {
    const now = performance.now();
    if (input === 'action') {
      if (state.phase === 'ready' || state.phase === 'gameover') {
        startGame(now);
        return;
      }
      if (state.phase === 'duel' && state.duel) {
        state.duel.meter = trailDuelPress(state.duel.meter);
        if (state.duel.meter >= 100) winDuel(now);
      }
      return;
    }

    if (state.phase !== 'running' || (input !== 'left' && input !== 'right')) return;
    const direction = input === 'left' ? -1 : 1;
    const targetLane = state.power
      ? trailPowerLane({ lane: state.lane, direction, power: state.power })
      : Math.max(0, Math.min(TRAIL_LANES - 1, state.lane + direction));
    if (targetLane === state.lane) return;
    tryCaptureInLane(targetLane, now);
    state.lane = targetLane;
    targetLaneX = laneX(targetLane);
  }

  function keydown(event) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      control('left');
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      control('right');
    } else if (event.code === 'Space' || event.key === ' ') {
      event.preventDefault();
      control('action');
    }
  }
  window.addEventListener('keydown', keydown, { passive: false });

  function emitHud(now, force = false) {
    if (!force && now - lastHudAt < 80) return;
    lastHudAt = now;
    onHud?.(hudFromState(state, now));
  }

  function updateRunning(now, dt) {
    const previousDistance = state.distance;
    state.speed = trailSpeedForDistance(state.distance);
    state.distance += state.speed * dt * 1.18;
    state.score += state.speed * dt * 2.2;

    const sector = trailSectorForDistance(state.distance);
    if (sector.key !== state.sectorKey) {
      state.sectorKey = sector.key;
      setToast(sector.toast, now, 1700);
    }

    if (trailPromotionCrossed(previousDistance, state.distance, state.promotionRefused)) {
      state.promotionRefused = true;
      state.promotionUntil = now + 2500;
      state.score += TRAIL_PROMOTION_BONUS;
      setToast(`PROMOCIÓN RECHAZADA · +${TRAIL_PROMOTION_BONUS}`, now, 2200);
    }

    if (state.power && now >= state.powerUntil) {
      state.power = null;
      state.powerUntil = 0;
      setToast('Vuelves a ser peón. Como debe ser.', now, 1100);
    }
    if (state.combo && now >= state.comboUntil) state.combo = 0;
    if (state.slashUntil && now >= state.slashUntil) {
      state.slashUntil = 0;
      matthias.material.map = texture(TRAIL_SPRITES.matthiasRun);
      matthias.material.needsUpdate = true;
    }

    state.spawnIn -= state.speed * dt;
    if (state.spawnIn <= 0) {
      spawnObject();
      state.spawnIn = Math.max(2.7, 5.6 - state.speed * 0.18) + Math.random() * 2.8;
    }

    for (const item of [...state.objects]) {
      item.z += state.speed * dt * 1.75;
      if (item.enemyType === 'knight' && !item.hopped && item.z > -4.5) {
        item.hopped = true;
        const toward = state.lane > item.lane ? 2 : -2;
        item.lane = Math.max(0, Math.min(TRAIL_LANES - 1, item.lane + toward));
      }
      item.mesh.position.x += (laneX(item.lane) - item.mesh.position.x) * Math.min(1, dt * 8);
      item.mesh.position.z = item.z;
      if (item.kind === 'power') {
        item.mesh.position.y = 0.78 + Math.sin(now / 180 + item.id) * 0.09;
        item.mesh.material.rotation = now / 900;
      } else if (item.enemyType === 'knight') {
        item.mesh.position.y = 0.94 + Math.abs(Math.sin(now / 230 + item.id)) * 0.2;
      } else {
        item.mesh.position.y = 0.9 + Math.abs(Math.sin(now / 310 + item.id)) * 0.05;
      }

      if (item.z > PLAYER_Z + 2.2) {
        removeObject(item);
        continue;
      }

      if (Math.abs(item.z - PLAYER_Z) <= COLLISION_WINDOW && item.lane === state.lane) {
        if (item.kind === 'power') {
          collectPower(item, now);
        } else if (item.enemyType === 'pawn') {
          beginDuel(item, now);
          return;
        } else {
          damage(now, item.enemyType === 'rook' ? 'TORRE FRONTAL · eso deja marca.' : `${String(item.enemyType).toUpperCase()} te ha cazado.`);
          removeObject(item);
          if (state.phase === 'gameover') return;
        }
      }
    }
  }

  function updateDuel(now, dt) {
    if (!state.duel) {
      state.phase = 'running';
      return;
    }
    state.duel.meter = trailDuelDecay(state.duel.meter, dt);
    const item = state.objects.find((candidate) => candidate.id === state.duel.enemyId);
    if (!item) {
      state.duel = null;
      state.phase = 'running';
      return;
    }
    item.z = PLAYER_Z - 0.18;
    item.mesh.position.z = item.z;
    item.mesh.position.x = laneX(state.lane) + state.duel.direction * 0.46;
    item.mesh.position.y = 0.92 + Math.sin(now / 85) * 0.04;
    if (state.duel.meter <= 0) {
      damage(now, 'El peón rival te ha mandado a paseo.');
      removeObject(item);
      state.duel = null;
      if (state.phase !== 'gameover') state.phase = 'running';
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

    const trackAdvance = state.phase === 'running' ? state.speed * dt * 1.75 : 0;
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
      musicKind = next === 'classical' ? 'classical' : 'synthmetal';
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
      scene.remove(matthias);
      matthias.material.dispose();
      disposeObject(scene);
      for (const value of textures.values()) value.dispose?.();
      textures.clear();
      renderer.dispose();
      renderer.forceContextLoss?.();
      if (host.contains(renderer.domElement)) host.removeChild(renderer.domElement);
    },
  };
}
