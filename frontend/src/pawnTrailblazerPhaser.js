import Phaser from 'phaser';
import { duckAmbientMusic } from './sound.js';
import { TRAIL_SPRITES } from './pawnTrailblazerSprites.js';
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
  trailSpriteMotion,
} from './pawnTrailblazer.js';
import './components/PawnTrailblazerPhaser.css';

const MAX_DEPTH = 34;
const COLLISION_Z = 1.25;
const CAPTURE_WINDOW = 4.2;
const BISHOP_AIM_Z = 16;
const BISHOP_AIM_MS = 700;
const POWER_TYPES = ['rook', 'bishop', 'queen'];

const ENEMY_TEXTURES = Object.freeze({
  pawn: 'enemyPawn',
  knight: 'enemyKnight',
  bishop: 'enemyBishop',
  rook: 'enemyRook',
});

const POWER_TEXTURES = Object.freeze({
  rook: 'powerRook',
  bishop: 'powerBishop',
  queen: 'powerQueen',
});

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
    flashUntil: 0,
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

export function trailProject(lane, z, width, height) {
  const depth = Math.max(0, Math.min(1, z / MAX_DEPTH));
  const near = 1 - depth;
  const horizon = height * 0.17;
  const floor = height * 0.9;
  const y = horizon + (floor - horizon) * Math.pow(near, 1.35);
  const halfWidth = width * (0.075 + 0.43 * Math.pow(near, 1.05));
  const laneWidth = (halfWidth * 2) / TRAIL_LANES;
  const x = width / 2 - halfWidth + laneWidth * (lane + 0.5);
  const scale = 0.18 + Math.pow(near, 1.3) * 0.95;
  return { x, y, laneWidth, scale, halfWidth };
}

function createArcadeMusic(kind) {
  if (typeof window === 'undefined') return () => {};
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return () => {};
  const ctx = new AudioCtx();
  const master = ctx.createGain();
  master.gain.value = 0.045;
  master.connect(ctx.destination);
  let step = 0;
  let timer = null;

  function tone(freq, when, duration, type = 'triangle', gainValue = 0.4) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(gainValue, when + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(when);
    osc.stop(when + duration + 0.03);
  }

  function tick() {
    const now = ctx.currentTime + 0.03;
    if (kind === 'classical') {
      const line = [220, 261.63, 329.63, 392, 329.63, 293.66, 261.63, 246.94];
      tone(line[step % line.length], now, 0.42, 'triangle', 0.32);
      tone(line[(step + 4) % line.length] / 2, now, 0.55, 'sine', 0.18);
    } else {
      const riff = [82.41, 82.41, 98, 110, 82.41, 123.47, 110, 98];
      tone(riff[step % riff.length], now, 0.18, 'sawtooth', 0.34);
      if (step % 2 === 0) tone(riff[(step + 3) % riff.length] * 2, now + 0.08, 0.28, 'square', 0.12);
    }
    step += 1;
  }

  tick();
  timer = window.setInterval(tick, kind === 'classical' ? 360 : 220);
  return () => {
    if (timer) window.clearInterval(timer);
    void ctx.close().catch(() => {});
  };
}

function drawTrack(graphics, width, height, distance, reducedMotion) {
  graphics.clear();
  graphics.fillStyle(0x07090d, 1);
  graphics.fillRect(0, 0, width, height);
  graphics.fillStyle(0x171b27, 1);
  graphics.fillRect(0, 0, width, height * 0.5);
  graphics.fillStyle(0x0c1018, 0.95);
  graphics.fillRect(0, height * 0.12, width, height * 0.17);

  const safeDistance = reducedMotion ? 0 : Math.max(0, Number(distance) || 0);
  const scroll = safeDistance % 1;
  const checkerPhase = Math.floor(safeDistance);

  for (let row = Math.ceil(MAX_DEPTH) + 1; row >= 0; row -= 1) {
    const farZ = Math.max(0, row + 1 - scroll);
    const nearZ = Math.max(0, row - scroll);
    const far = trailProject(0, farZ, width, height);
    const near = trailProject(0, nearZ, width, height);

    for (let lane = 0; lane < TRAIL_LANES; lane += 1) {
      const f = trailProject(lane, farZ, width, height);
      const n = trailProject(lane, nearZ, width, height);
      graphics.fillStyle((row + lane + checkerPhase) % 2 ? 0x5a4636 : 0xd9d0bb, 0.86);
      graphics.lineStyle(Math.max(0.6, 1.3 * n.scale), 0x0a0a0a, 0.28);
      graphics.beginPath();
      graphics.moveTo(f.x - f.laneWidth / 2, f.y);
      graphics.lineTo(f.x + f.laneWidth / 2, f.y);
      graphics.lineTo(n.x + n.laneWidth / 2, n.y);
      graphics.lineTo(n.x - n.laneWidth / 2, n.y);
      graphics.closePath();
      graphics.fillPath();
      graphics.strokePath();
    }

    if (far.halfWidth < 1 || near.halfWidth < 1) break;
  }

  const leftFar = trailProject(0, MAX_DEPTH, width, height);
  const leftNear = trailProject(0, 0, width, height);
  const rightFar = trailProject(TRAIL_LANES - 1, MAX_DEPTH, width, height);
  const rightNear = trailProject(TRAIL_LANES - 1, 0, width, height);
  graphics.lineStyle(2, 0xc9a227, 0.38);
  graphics.beginPath();
  graphics.moveTo(leftFar.x - leftFar.laneWidth / 2, leftFar.y);
  graphics.lineTo(leftNear.x - leftNear.laneWidth / 2, leftNear.y);
  graphics.moveTo(rightFar.x + rightFar.laneWidth / 2, rightFar.y);
  graphics.lineTo(rightNear.x + rightNear.laneWidth / 2, rightNear.y);
  graphics.strokePath();
}

function drawDashedLine(graphics, from, to, dashLength, gapLength) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (!length) return;
  const ux = dx / length;
  const uy = dy / length;
  for (let cursor = 0; cursor < length; cursor += dashLength + gapLength) {
    const end = Math.min(length, cursor + dashLength);
    graphics.beginPath();
    graphics.moveTo(from.x + ux * cursor, from.y + uy * cursor);
    graphics.lineTo(from.x + ux * end, from.y + uy * end);
    graphics.strokePath();
  }
}

class PawnTrailblazerScene extends Phaser.Scene {
  constructor(callbacks = {}) {
    super({ key: 'PawnTrailblazerScene' });
    this.callbacks = callbacks;
    this.state = createTrailGameState();
    this.nodes = new Map();
    this.musicKind = 'synthmetal';
    this.stopMusic = () => {};
    this.hudAt = 0;
    this.previousLives = this.state.lives;
    this.wasSlashing = false;
    this.reducedMotion = false;
    this.mediaQuery = null;
    this.mediaListener = null;
    this.pendingControls = [];
    this.ready = false;
  }

  preload() {
    for (const [key, src] of Object.entries(TRAIL_SPRITES)) this.load.image(key, src);
  }

  create() {
    this.trackGraphics = this.add.graphics().setDepth(0);
    this.aimGraphics = this.add.graphics().setDepth(1400);
    this.shadowGraphics = this.add.graphics().setDepth(1900);
    this.fxGraphics = this.add.graphics().setDepth(2100);
    this.matthias = this.add.image(0, 0, 'matthiasRun').setOrigin(0.5).setDepth(2000);
    this.powerBadge = this.add.image(0, 0, 'powerQueen').setOrigin(0.5).setDepth(2050).setVisible(false);

    this.mediaQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)') || null;
    this.mediaListener = () => { this.reducedMotion = Boolean(this.mediaQuery?.matches); };
    this.mediaListener();
    this.mediaQuery?.addEventListener?.('change', this.mediaListener);

    this.input.keyboard?.addCapture([
      Phaser.Input.Keyboard.KeyCodes.LEFT,
      Phaser.Input.Keyboard.KeyCodes.RIGHT,
      Phaser.Input.Keyboard.KeyCodes.SPACE,
    ]);
    this.input.keyboard?.on('keydown', this.onKeyboardDown, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.onShutdown, this);

    this.ready = true;
    this.callbacks.onReady?.(this.game.renderer.type === Phaser.WEBGL ? 'WEBGL' : 'CANVAS');
    this.emitHud(true);
    this.renderWorld(this.time.now);

    for (const control of this.pendingControls.splice(0)) this.handleControl(control);
  }

  onShutdown() {
    this.stopRunAudio();
    this.input.keyboard?.off('keydown', this.onKeyboardDown, this);
    this.mediaQuery?.removeEventListener?.('change', this.mediaListener);
    this.mediaQuery = null;
    this.mediaListener = null;
    this.ready = false;
  }

  onKeyboardDown(event) {
    if (event.key === 'ArrowLeft') this.handleControl('left');
    else if (event.key === 'ArrowRight') this.handleControl('right');
    else if (event.code === 'Space' || event.key === ' ' || event.key === 'Spacebar') this.handleControl('action');
  }

  queueOrHandle(control) {
    if (!this.ready) {
      this.pendingControls.push(control);
      return;
    }
    this.handleControl(control);
  }

  startRunAudio() {
    this.stopRunAudio();
    duckAmbientMusic(true);
    this.stopMusic = createArcadeMusic(this.musicKind);
  }

  stopRunAudio() {
    this.stopMusic();
    this.stopMusic = () => {};
    duckAmbientMusic(false);
  }

  setMusic(kind) {
    if (!['synthmetal', 'classical'].includes(kind)) return;
    this.musicKind = kind;
    if (this.state.phase === 'running' || this.state.phase === 'duel') {
      this.stopMusic();
      this.stopMusic = createArcadeMusic(this.musicKind);
    }
  }

  setToast(text, now, duration = 1200) {
    this.state.toast = text;
    this.state.toastUntil = now + duration;
  }

  breakCombo() {
    this.state.combo = 0;
    this.state.comboUntil = 0;
    this.state.lastCaptureAt = 0;
  }

  clearObjectNodes() {
    for (const node of this.nodes.values()) node.object.destroy();
    this.nodes.clear();
  }

  startRun() {
    this.stopRunAudio();
    this.clearObjectNodes();
    this.state = createTrailGameState();
    this.state.phase = 'running';
    const now = this.time.now;
    this.state.toast = 'Vorwärts.';
    this.state.toastUntil = now + 1100;
    this.previousLives = this.state.lives;
    this.wasSlashing = false;
    this.startRunAudio();
    this.emitHud(true);
  }

  objectLane(preferCurrent = false) {
    if (preferCurrent) return this.state.lane;
    return Math.floor(Math.random() * TRAIL_LANES);
  }

  spawnObject() {
    const state = this.state;
    const roll = Math.random();
    let kind = 'enemy';
    if (roll < 0.19) kind = 'power';
    else if (roll > 0.7) kind = 'obstacle';

    let lane = this.objectLane(kind === 'power');
    if (kind === 'obstacle' && !state.power && lane === state.lane) {
      lane = (lane + 1 + Math.floor(Math.random() * (TRAIL_LANES - 1))) % TRAIL_LANES;
    }
    if (kind === 'enemy' && Math.random() < 0.55) {
      const direction = Math.random() < 0.5 ? -1 : 1;
      lane = Math.max(0, Math.min(TRAIL_LANES - 1, state.lane + direction));
    }

    state.objects.push({
      id: state.nextId++,
      kind,
      lane,
      z: MAX_DEPTH,
      power: kind === 'power' ? POWER_TYPES[Math.floor(Math.random() * POWER_TYPES.length)] : null,
      enemyType: kind === 'enemy' ? trailEnemyTypeForDistance(state.distance, Math.random()) : null,
      jumped: false,
      aimed: false,
      fired: false,
      aimLane: null,
      aimUntil: 0,
    });
    state.spawnIn = Math.max(3.25, 4.35 + Math.random() * 3.1 - state.distance / 900);
  }

  removeObject(id) {
    this.state.objects = this.state.objects.filter((item) => item.id !== id);
  }

  nearestObject(lane, kind = null) {
    return this.state.objects
      .filter((item) => item.lane === lane && item.z > 0.35 && item.z < CAPTURE_WINDOW && (!kind || item.kind === kind))
      .sort((a, b) => a.z - b.z)[0] || null;
  }

  loseLife(now, message) {
    const state = this.state;
    state.lives -= 1;
    state.flashUntil = now + 420;
    state.duel = null;
    this.breakCombo();
    state.phase = state.lives <= 0 ? 'gameover' : 'running';
    this.setToast(state.lives <= 0 ? 'Fin de maniobras. Otra vez.' : message, now, 1600);
    if (state.phase === 'gameover') this.stopRunAudio();
    this.emitHud(true);
  }

  finishCapture(enemy, targetLane, now, points = trailEnemyCapturePoints(enemy?.enemyType)) {
    const state = this.state;
    this.removeObject(enemy.id);
    state.lane = targetLane;
    state.combo = trailComboAfterCapture(state.combo, state.lastCaptureAt, now);
    state.lastCaptureAt = now;
    state.comboUntil = now + TRAIL_COMBO_WINDOW_MS;
    state.captures += 1;
    const multiplier = trailComboMultiplier(state.combo);
    const awarded = Math.round(points * multiplier);
    state.score += awarded;
    state.slashUntil = now + 380;
    state.duel = null;
    state.phase = 'running';
    this.setToast(state.combo > 1 ? `COMBO x${state.combo} · +${awarded}` : `Captura · +${awarded}`, now, 1050);
    this.emitHud(true);
  }

  handleControl(control) {
    const state = this.state;
    const now = this.time.now;

    if (state.phase === 'ready' || state.phase === 'gameover') {
      if (control === 'action') this.startRun();
      return;
    }

    if (state.phase === 'running' && control === 'action') {
      const sniper = state.objects.find((item) => (
        item.kind === 'enemy'
        && item.enemyType === 'bishop'
        && item.aimed
        && !item.fired
        && item.aimLane === state.lane
      ));
      if (sniper && trailBishopParryReady(sniper.aimUntil, now)) {
        sniper.fired = true;
        state.score += 120;
        state.slashUntil = now + 360;
        this.setToast('PARADA · +120. Nein.', now, 900);
        this.emitHud(true);
      } else if (sniper) {
        this.setToast('Aún no. Espera el destello del alfil.', now, 700);
        this.emitHud(true);
      }
      return;
    }

    if (state.phase === 'duel' && state.duel) {
      if (control === 'left') state.duel.direction = trailDuelDirection(state.lane, -1);
      else if (control === 'right') state.duel.direction = trailDuelDirection(state.lane, 1);
      else if (control === 'action') {
        state.duel.meter = trailDuelPress(state.duel.meter);
        if (state.duel.meter >= 100) {
          const enemy = state.objects.find((item) => item.id === state.duel.enemyId);
          if (enemy) {
            const direction = trailDuelDirection(state.lane, state.duel.direction);
            this.finishCapture(enemy, state.lane + direction, now);
          }
        }
      }
      this.emitHud(true);
      return;
    }

    if (state.phase !== 'running' || (control !== 'left' && control !== 'right')) return;
    const direction = control === 'left' ? -1 : 1;
    const targetLane = state.lane + direction;
    if (targetLane < 0 || targetLane >= TRAIL_LANES) return;

    if (state.power) {
      const nextLane = trailPowerLane({ lane: state.lane, direction, power: state.power });
      const victim = this.nearestObject(nextLane);
      if (victim && (state.power === 'bishop' || state.power === 'queen')) {
        if (victim.kind === 'enemy') this.finishCapture(victim, nextLane, now);
        else {
          this.removeObject(victim.id);
          state.score += 70;
          state.slashUntil = now + 250;
          state.lane = nextLane;
          this.emitHud(true);
        }
        return;
      }
      state.lane = nextLane;
      this.emitHud(true);
      return;
    }

    const enemy = this.nearestObject(targetLane, 'enemy');
    if (enemy) {
      this.finishCapture(enemy, targetLane, now);
    } else {
      this.setToast('Nein. Un peón no se mueve de lado.', now, 900);
      this.emitHud(true);
    }
  }

  updateRunning(now, dt) {
    const state = this.state;
    const previousDistance = state.distance;
    state.speed = trailSpeedForDistance(state.distance);
    state.distance += state.speed * dt;
    state.score += state.speed * dt * 2;

    const sector = trailSectorForDistance(state.distance);
    if (sector.key !== state.sectorKey) {
      state.sectorKey = sector.key;
      this.setToast(`SECTOR ${sector.code} · ${sector.name} · ${sector.toast}`, now, 1600);
    }
    if (trailPromotionCrossed(previousDistance, state.distance, state.promotionRefused)) {
      state.promotionRefused = true;
      state.promotionUntil = now + 1900;
      state.score += TRAIL_PROMOTION_BONUS;
      state.flashUntil = now + 320;
      this.setToast(`PROMOCIÓN A DAMA · RECHAZADA. +${TRAIL_PROMOTION_BONUS}`, now, 1900);
    }

    state.spawnIn -= state.speed * dt;
    if (state.spawnIn <= 0) this.spawnObject();

    for (const item of [...state.objects]) {
      item.z -= state.speed * dt;
      if (item.kind !== 'enemy') continue;

      if (item.enemyType === 'knight' && !item.jumped && item.z < 12) {
        item.lane = trailKnightJumpLane(item.lane, state.lane);
        item.jumped = true;
      }

      if (item.enemyType === 'bishop' && !item.aimed && item.z < BISHOP_AIM_Z) {
        item.aimed = true;
        item.aimLane = trailBishopTargetLane(item.lane, state.lane);
        item.aimUntil = now + BISHOP_AIM_MS;
        this.setToast('ALFIL · diagonal marcada. Muévete o para el disparo.', now, 900);
      } else if (item.enemyType === 'bishop' && item.aimed && !item.fired && now >= item.aimUntil) {
        item.fired = true;
        if (state.lane === item.aimLane) {
          this.loseLife(now, 'El alfil te ha cosido en diagonal. Eso sí estaba anunciado.');
          if (state.phase !== 'running') break;
        } else {
          this.setToast('El disparo del alfil ha pasado de largo.', now, 850);
        }
      }
    }

    if (state.phase !== 'running') return;

    for (const item of [...state.objects].sort((a, b) => a.z - b.z)) {
      if (item.z > COLLISION_Z || item.lane !== state.lane) continue;
      if (item.kind === 'power') {
        state.power = item.power;
        state.powerUntil = now + TRAIL_POWER_DURATION_MS;
        state.score += 80;
        this.removeObject(item.id);
        this.setToast(`${trailPowerLabel(item.power)} · movimiento desbloqueado`, now, 1400);
      } else if (item.kind === 'enemy' && item.enemyType === 'pawn') {
        state.phase = 'duel';
        state.duel = {
          enemyId: item.id,
          meter: 24,
          timeLeft: 2.6,
          direction: state.lane === TRAIL_LANES - 1 ? -1 : 1,
        };
        this.setToast('¡FRONTAL! Machaca ESPACIO.', now, 1000);
        this.emitHud(true);
        break;
      } else if (item.kind === 'enemy' && item.enemyType === 'knight') {
        this.removeObject(item.id);
        this.loseLife(now, 'El caballo ha saltado sobre tu línea. Previsible después de verlo.');
        break;
      } else if (item.kind === 'enemy' && item.enemyType === 'bishop') {
        this.removeObject(item.id);
        this.loseLife(now, 'El alfil ha cerrado la diagonal. Muy litúrgico todo.');
        break;
      } else if (item.kind === 'enemy' && item.enemyType === 'rook') {
        this.removeObject(item.id);
        this.loseLife(now, 'Una torre de frente. Ni siquiera tú eres tan cabezón, Matthias.');
        break;
      } else {
        this.removeObject(item.id);
        this.loseLife(now, 'Eso era un obstáculo, general.');
        break;
      }
    }

    state.objects = state.objects.filter((item) => item.z > -2);
  }

  updateDuel(now, dt) {
    const state = this.state;
    if (!state.duel) return;
    state.duel.meter = trailDuelDecay(state.duel.meter, dt);
    state.duel.timeLeft -= dt;
    if (state.duel.timeLeft <= 0) {
      const enemy = state.objects.find((item) => item.id === state.duel?.enemyId);
      if (enemy) this.removeObject(enemy.id);
      this.loseLife(now, 'El otro peón te ha echado para atrás. Vergüenza administrativa.');
    }
  }

  update(time, delta) {
    if (!this.ready) return;
    const now = time;
    const dt = Math.min(0.05, Math.max(0, delta / 1000));
    const state = this.state;

    if (state.power && now >= state.powerUntil) state.power = null;
    if (state.combo && now >= state.comboUntil) this.breakCombo();

    if (state.phase === 'running') this.updateRunning(now, dt);
    else if (state.phase === 'duel') this.updateDuel(now, dt);

    this.renderWorld(now);
    this.emitHud(false, now);
  }

  publicHud(now = this.time.now) {
    const state = this.state;
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

  emitHud(force = false, now = this.time.now) {
    if (!force && now - this.hudAt < 90) return;
    this.hudAt = now;
    this.callbacks.onHud?.(this.publicHud(now));
  }

  ensureNode(item, textureKey) {
    const existing = this.nodes.get(item.id);
    if (existing) {
      if (existing.kind === 'image' && existing.object.texture.key !== textureKey) existing.object.setTexture(textureKey);
      return existing;
    }

    const node = item.kind === 'obstacle'
      ? { kind: 'rect', object: this.add.rectangle(0, 0, 28, 28, 0x7c2f2a, 1).setStrokeStyle(2, 0xdb8e75, 0.95) }
      : { kind: 'image', object: this.add.image(0, 0, textureKey).setOrigin(0.5) };
    this.nodes.set(item.id, node);
    return node;
  }

  removeMissingNodes() {
    const liveIds = new Set(this.state.objects.map((item) => item.id));
    for (const [id, node] of this.nodes.entries()) {
      if (liveIds.has(id)) continue;
      node.object.destroy();
      this.nodes.delete(id);
    }
  }

  renderObject(item, width, height, now) {
    const state = this.state;
    const p = trailProject(item.lane, item.z, width, height);
    const size = Math.max(16, 58 * p.scale);
    const duelActive = state.phase === 'duel' && state.duel?.enemyId === item.id;
    let textureKey = '';

    if (item.kind === 'enemy') {
      textureKey = duelActive && item.enemyType === 'pawn'
        ? 'enemyDuelist'
        : (ENEMY_TEXTURES[item.enemyType] || ENEMY_TEXTURES.pawn);
    } else if (item.kind === 'power') {
      textureKey = POWER_TEXTURES[item.power] || POWER_TEXTURES.queen;
    }

    const node = this.ensureNode(item, textureKey);
    node.object.setDepth(400 + Math.round((MAX_DEPTH - item.z) * 28));

    if (node.kind === 'rect') {
      node.object.setPosition(p.x, p.y - size * 0.42);
      node.object.setDisplaySize(size * 0.64, size * 0.56);
      node.object.setRotation(0);
      node.object.setAlpha(0.82 + p.scale * 0.16);
      return;
    }

    const motionKind = item.kind === 'power'
      ? 'power'
      : duelActive && item.enemyType === 'pawn' ? 'duelist' : item.enemyType;
    const motionState = this.reducedMotion
      ? 'reduced'
      : item.enemyType === 'bishop' && item.aimed && !item.fired ? 'aiming' : 'running';
    const motion = trailSpriteMotion(motionKind, now, item.id, motionState);
    const targetSize = item.kind === 'power' ? size * 0.92 : size;
    const baseScale = targetSize / Math.max(1, node.object.width);
    node.object.setPosition(
      p.x + motion.x * targetSize,
      p.y - size * 0.48 + motion.y * targetSize,
    );
    node.object.setRotation(motion.rotation || 0);
    node.object.setScale(baseScale * (motion.scaleX || 1), baseScale * (motion.scaleY || 1));
    node.object.setAlpha(Phaser.Math.Clamp(0.45 + p.scale * 0.62, 0.45, 1));
  }

  renderBishopAims(width, height, now) {
    this.aimGraphics.clear();
    for (const item of this.state.objects) {
      if (item.enemyType !== 'bishop' || !item.aimed || item.fired || item.aimLane == null || now >= item.aimUntil) continue;
      const from = trailProject(item.lane, item.z, width, height);
      const to = trailProject(item.aimLane, 0.25, width, height);
      const remaining = Phaser.Math.Clamp((item.aimUntil - now) / BISHOP_AIM_MS, 0, 1);
      this.aimGraphics.lineStyle(Math.max(2, 5 * from.scale), 0xff5b4f, 0.35 + (1 - remaining) * 0.55);
      drawDashedLine(
        this.aimGraphics,
        { x: from.x, y: from.y - 18 * from.scale },
        { x: to.x, y: to.y - 38 },
        8,
        6,
      );
    }
  }

  renderMatthias(width, height, now) {
    const state = this.state;
    const p = trailProject(state.lane, 0.2, width, height);
    const size = Math.max(72, Math.min(116, width * 0.13));
    const slash = now < state.slashUntil;
    const motionState = this.reducedMotion ? 'reduced' : slash ? 'slash' : state.phase === 'duel' ? 'duel' : 'running';
    const motion = trailSpriteMotion('matthias', now, 0, motionState);
    const textureKey = slash ? 'matthiasCapture' : 'matthiasRun';
    if (this.matthias.texture.key !== textureKey) this.matthias.setTexture(textureKey);

    this.shadowGraphics.clear();
    const lift = Math.min(0.15, Math.abs(motion.y));
    this.shadowGraphics.fillStyle(0x000000, 0.34);
    this.shadowGraphics.fillEllipse(
      p.x,
      p.y - size * 0.03,
      size * (0.60 - lift * 1.4),
      size * (0.15 - lift * 0.32),
    );

    const baseScale = size / Math.max(1, this.matthias.width);
    this.matthias.setPosition(p.x + motion.x * size, p.y - size * 0.5 + motion.y * size);
    this.matthias.setRotation(motion.rotation || 0);
    this.matthias.setScale(baseScale * (motion.scaleX || 1), baseScale * (motion.scaleY || 1));
    this.matthias.setAlpha(now < state.flashUntil ? 0.72 : 1);

    this.powerBadge.setVisible(Boolean(state.power));
    if (state.power) {
      const badgeKey = POWER_TEXTURES[state.power] || POWER_TEXTURES.queen;
      if (this.powerBadge.texture.key !== badgeKey) this.powerBadge.setTexture(badgeKey);
      const badgeMotion = trailSpriteMotion('power', now, 11, this.reducedMotion ? 'reduced' : 'running');
      const badgeSize = size * 0.34;
      const badgeScale = badgeSize / Math.max(1, this.powerBadge.width);
      this.powerBadge.setPosition(
        p.x + size * 0.42 + badgeMotion.x * badgeSize,
        p.y - size * 0.88 + badgeMotion.y * badgeSize,
      );
      this.powerBadge.setRotation(badgeMotion.rotation || 0);
      this.powerBadge.setScale(badgeScale * (badgeMotion.scaleX || 1), badgeScale * (badgeMotion.scaleY || 1));
    }

    this.fxGraphics.clear();
    if (slash) {
      this.fxGraphics.lineStyle(Math.max(3, size * 0.045), 0xffefae, 0.9);
      this.fxGraphics.beginPath();
      this.fxGraphics.moveTo(p.x - size * 0.5, p.y - size * 0.72);
      this.fxGraphics.lineTo(p.x + size * 0.52, p.y - size * 0.25);
      this.fxGraphics.strokePath();
    }

    if (!this.reducedMotion && this.previousLives != null && state.lives < this.previousLives) {
      this.cameras.main.shake(140, 0.008);
    }
    if (!this.reducedMotion && slash && !this.wasSlashing) {
      this.cameras.main.shake(65, 0.0022);
    }
    this.previousLives = state.lives;
    this.wasSlashing = slash;
  }

  renderWorld(now) {
    const width = Math.max(320, this.scale.width || 320);
    const height = Math.max(420, this.scale.height || 420);
    drawTrack(this.trackGraphics, width, height, this.state.distance, this.reducedMotion);
    this.renderBishopAims(width, height, now);
    this.removeMissingNodes();
    for (const item of [...this.state.objects].sort((a, b) => b.z - a.z)) {
      this.renderObject(item, width, height, now);
    }
    this.renderMatthias(width, height, now);
  }
}

export function createPawnTrailblazerGame(host, callbacks = {}) {
  if (!host) throw new Error('Pawn Trailblazer requires a host element');
  const scene = new PawnTrailblazerScene(callbacks);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: host,
    backgroundColor: '#07090d',
    antialias: true,
    pixelArt: false,
    roundPixels: false,
    banner: false,
    audio: { noAudio: true },
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: Math.max(320, host.clientWidth || 320),
      height: Math.max(420, host.clientHeight || 420),
    },
    scene,
  });

  return {
    input(control) {
      if (!['left', 'right', 'action'].includes(control)) return;
      scene.queueOrHandle(control);
    },
    setMusic(kind) {
      scene.setMusic(kind);
    },
    getState() {
      return scene.publicHud();
    },
    destroy() {
      scene.stopRunAudio();
      game.destroy(true);
      host.replaceChildren();
    },
  };
}
