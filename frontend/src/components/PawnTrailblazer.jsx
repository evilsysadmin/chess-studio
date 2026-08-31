import { useEffect, useRef, useState } from 'react';
import { duckAmbientMusic } from '../sound.js';
import { TRAIL_SPRITES } from '../pawnTrailblazerSprites.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import {
  TRAIL_COMBO_WINDOW_MS,
  TRAIL_LANES,
  TRAIL_POWER_DURATION_MS,
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
  trailSpeedForDistance,
} from '../pawnTrailblazer.js';
import './PawnTrailblazer.css';

const MAX_DEPTH = 34;
const COLLISION_Z = 1.25;
const CAPTURE_WINDOW = 4.2;
const POWER_TYPES = ['rook', 'bishop', 'queen'];
const BISHOP_AIM_Z = 16;
const BISHOP_AIM_MS = 700;

const ENEMY_SPRITE_KEYS = Object.freeze({
  pawn: 'enemyPawn',
  knight: 'enemyKnight',
  bishop: 'enemyBishop',
  rook: 'enemyRook',
});

const POWER_SPRITE_KEYS = Object.freeze({
  rook: 'powerRook',
  bishop: 'powerBishop',
  queen: 'powerQueen',
});

function createGame() {
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
    toast: 'Nací peón. Siempre seré peón.',
    toastUntil: 0,
    lastTime: 0,
  };
}

function project(lane, z, width, height) {
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

function objectLane(game, preferCurrent = false) {
  if (preferCurrent) return game.lane;
  return Math.floor(Math.random() * TRAIL_LANES);
}

function spawnObject(game) {
  const roll = Math.random();
  let kind = 'enemy';
  if (roll < 0.19) kind = 'power';
  else if (roll > 0.7) kind = 'obstacle';

  let lane = objectLane(game, kind === 'power');
  if (kind === 'obstacle' && !game.power && lane === game.lane) {
    lane = (lane + 1 + Math.floor(Math.random() * (TRAIL_LANES - 1))) % TRAIL_LANES;
  }
  if (kind === 'enemy' && Math.random() < 0.55) {
    const dir = Math.random() < 0.5 ? -1 : 1;
    lane = Math.max(0, Math.min(TRAIL_LANES - 1, game.lane + dir));
  }

  game.objects.push({
    id: game.nextId++,
    kind,
    lane,
    z: MAX_DEPTH,
    power: kind === 'power' ? POWER_TYPES[Math.floor(Math.random() * POWER_TYPES.length)] : null,
    enemyType: kind === 'enemy' ? trailEnemyTypeForDistance(game.distance, Math.random()) : null,
    jumped: false,
    aimed: false,
    fired: false,
    aimLane: null,
    aimUntil: 0,
  });
  game.spawnIn = Math.max(3.25, 4.35 + Math.random() * 3.1 - game.distance / 900);
}

function removeObject(game, id) {
  game.objects = game.objects.filter((item) => item.id !== id);
}

function nearestObject(game, lane, kind = null) {
  return game.objects
    .filter((item) => item.lane === lane && item.z > 0.35 && item.z < CAPTURE_WINDOW && (!kind || item.kind === kind))
    .sort((a, b) => a.z - b.z)[0] || null;
}

function setToast(game, text, now, duration = 1200) {
  game.toast = text;
  game.toastUntil = now + duration;
}

function breakCombo(game) {
  game.combo = 0;
  game.comboUntil = 0;
  game.lastCaptureAt = 0;
}

function loseLife(game, now, message) {
  game.lives -= 1;
  game.flashUntil = now + 420;
  game.duel = null;
  breakCombo(game);
  game.phase = game.lives <= 0 ? 'gameover' : 'running';
  setToast(game, game.lives <= 0 ? 'Fin de maniobras. Otra vez.' : message, now, 1600);
}

function finishCapture(game, enemy, targetLane, now, points = trailEnemyCapturePoints(enemy?.enemyType)) {
  removeObject(game, enemy.id);
  game.lane = targetLane;
  game.combo = trailComboAfterCapture(game.combo, game.lastCaptureAt, now);
  game.lastCaptureAt = now;
  game.comboUntil = now + TRAIL_COMBO_WINDOW_MS;
  game.captures += 1;
  const multiplier = trailComboMultiplier(game.combo);
  const awarded = Math.round(points * multiplier);
  game.score += awarded;
  game.slashUntil = now + 380;
  game.duel = null;
  game.phase = 'running';
  setToast(game, game.combo > 1 ? `COMBO x${game.combo} · +${awarded}` : `Captura · +${awarded}`, now, 1050);
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

function preloadSprites() {
  const images = {};
  for (const [key, src] of Object.entries(TRAIL_SPRITES)) {
    const image = new Image();
    image.src = src;
    images[key] = image;
  }
  return images;
}

function drawTrack(ctx, width, height) {
  ctx.fillStyle = '#07090d';
  ctx.fillRect(0, 0, width, height);
  const grad = ctx.createLinearGradient(0, 0, 0, height * 0.45);
  grad.addColorStop(0, '#161923');
  grad.addColorStop(1, '#07090d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height * 0.5);

  for (let row = Math.ceil(MAX_DEPTH); row >= 0; row -= 1) {
    const far = project(0, row + 1, width, height);
    const near = project(0, row, width, height);
    for (let lane = 0; lane < TRAIL_LANES; lane += 1) {
      const f = project(lane, row + 1, width, height);
      const n = project(lane, row, width, height);
      ctx.beginPath();
      ctx.moveTo(f.x - f.laneWidth / 2, f.y);
      ctx.lineTo(f.x + f.laneWidth / 2, f.y);
      ctx.lineTo(n.x + n.laneWidth / 2, n.y);
      ctx.lineTo(n.x - n.laneWidth / 2, n.y);
      ctx.closePath();
      ctx.fillStyle = (row + lane) % 2 ? '#5a4636' : '#d9d0bb';
      ctx.globalAlpha = 0.82;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(10,10,10,.3)';
      ctx.stroke();
    }
    if (far.halfWidth < 1 || near.halfWidth < 1) break;
  }
}

function drawSprite(ctx, image, x, y, size, glow = '#d5b15a') {
  if (!image?.complete || !image.naturalWidth) return false;
  ctx.save();
  ctx.shadowColor = glow;
  ctx.shadowBlur = Math.max(2, size * 0.16);
  ctx.beginPath();
  const radius = Math.max(3, size * 0.16);
  ctx.roundRect(x - size / 2, y - size / 2, size, size, radius);
  ctx.clip();
  ctx.drawImage(image, x - size / 2, y - size / 2, size, size);
  ctx.restore();
  return true;
}

function drawBishopAim(ctx, item, width, height, now) {
  if (item.enemyType !== 'bishop' || !item.aimed || item.fired || item.aimLane == null || now >= item.aimUntil) return;
  const from = project(item.lane, item.z, width, height);
  const to = project(item.aimLane, 0.25, width, height);
  const remaining = Math.max(0, Math.min(1, (item.aimUntil - now) / BISHOP_AIM_MS));
  ctx.save();
  ctx.strokeStyle = `rgba(255, 91, 79, ${0.35 + (1 - remaining) * 0.55})`;
  ctx.lineWidth = Math.max(2, 5 * from.scale);
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y - 18 * from.scale);
  ctx.lineTo(to.x, to.y - 38);
  ctx.stroke();
  ctx.restore();
}

function drawObject(ctx, item, sprites, width, height, now, game) {
  const p = project(item.lane, item.z, width, height);
  const size = Math.max(16, 58 * p.scale);
  drawBishopAim(ctx, item, width, height, now);

  if (item.kind === 'enemy') {
    const duelActive = game.phase === 'duel' && game.duel?.enemyId === item.id;
    const spriteKey = duelActive && item.enemyType === 'pawn'
      ? 'enemyDuelist'
      : (ENEMY_SPRITE_KEYS[item.enemyType] || ENEMY_SPRITE_KEYS.pawn);
    const glow = item.enemyType === 'rook' ? '#c44c3d' : item.enemyType === 'bishop' ? '#d176ff' : '#d5b15a';
    if (drawSprite(ctx, sprites[spriteKey], p.x, p.y - size * 0.48, size, glow)) return;
  }

  if (item.kind === 'power') {
    const spriteKey = POWER_SPRITE_KEYS[item.power];
    const glow = item.power === 'rook' ? '#5eb8ff' : item.power === 'bishop' ? '#72d96d' : '#c58cff';
    if (drawSprite(ctx, sprites[spriteKey], p.x, p.y - size * 0.48, size * 0.92, glow)) return;
  }

  ctx.save();
  ctx.translate(p.x, p.y - size * 0.42);
  if (item.kind === 'enemy') {
    const glyph = item.enemyType === 'rook' ? '♜' : item.enemyType === 'bishop' ? '♝' : item.enemyType === 'knight' ? '♞' : '♟';
    ctx.fillStyle = '#17120f';
    ctx.strokeStyle = '#d5b15a';
    ctx.lineWidth = Math.max(1, p.scale * 2);
    ctx.font = `${Math.max(16, size * 1.05)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText(glyph, 0, 0);
    ctx.fillText(glyph, 0, 0);
  } else if (item.kind === 'power') {
    const labels = { rook: 'R', bishop: 'B', queen: 'Q' };
    const colors = { rook: '#5eb8ff', bishop: '#72d96d', queen: '#c58cff' };
    ctx.fillStyle = colors[item.power] || '#c9a227';
    ctx.strokeStyle = '#fff1a8';
    ctx.lineWidth = Math.max(1, p.scale * 2);
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#11131a';
    ctx.font = `bold ${Math.max(9, size * 0.42)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labels[item.power], 0, 1);
  } else {
    ctx.fillStyle = '#7c2f2a';
    ctx.strokeStyle = '#db8e75';
    ctx.lineWidth = Math.max(1, p.scale * 2);
    ctx.fillRect(-size * 0.32, -size * 0.28, size * 0.64, size * 0.56);
    ctx.strokeRect(-size * 0.32, -size * 0.28, size * 0.64, size * 0.56);
  }
  ctx.restore();
}

function drawMatthias(ctx, sprites, game, width, height, now) {
  const p = project(game.lane, 0.2, width, height);
  const size = Math.max(72, Math.min(116, width * 0.13));
  const image = now < game.slashUntil ? sprites.matthiasCapture : sprites.matthiasRun;
  const drew = drawSprite(ctx, image, p.x, p.y - size * 0.5, size, now < game.flashUntil ? '#ff5b4f' : '#d8b54f');

  if (game.power) {
    const badge = POWER_SPRITE_KEYS[game.power];
    drawSprite(ctx, sprites[badge], p.x + size * 0.42, p.y - size * 0.88, size * 0.34, '#fff3b0');
  }
  if (drew) return;

  ctx.save();
  ctx.translate(p.x, p.y - size * 0.54);
  ctx.fillStyle = '#d8c79d';
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.font = `${size * 0.65}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('♙', 0, 0);
  ctx.restore();
}

export default function PawnTrailblazer({ onExit }) {
  useEscapeToClose(onExit);
  const canvasRef = useRef(null);
  const gameRef = useRef(createGame());
  const spriteRef = useRef({});
  const musicStopRef = useRef(() => {});
  const musicRef = useRef('synthmetal');
  const [hud, setHud] = useState(() => ({ ...createGame() }));
  const [music, setMusic] = useState('synthmetal');

  useEffect(() => {
    spriteRef.current = preloadSprites();
    return () => { spriteRef.current = {}; };
  }, []);

  useEffect(() => () => {
    musicStopRef.current();
    duckAmbientMusic(false);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    let frame = 0;
    let hudAt = 0;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(320, Math.round(rect.width));
      const height = Math.max(420, Math.round(rect.height));
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      return { width, height };
    }

    function update(now) {
      const game = gameRef.current;
      if (!game.lastTime) game.lastTime = now;
      const dt = Math.min(0.05, Math.max(0, (now - game.lastTime) / 1000));
      game.lastTime = now;

      if (game.power && now >= game.powerUntil) game.power = null;
      if (game.combo && now >= game.comboUntil) breakCombo(game);

      if (game.phase === 'running') {
        game.speed = trailSpeedForDistance(game.distance);
        game.distance += game.speed * dt;
        game.score += game.speed * dt * 2;
        game.spawnIn -= game.speed * dt;
        if (game.spawnIn <= 0) spawnObject(game);

        for (const item of [...game.objects]) {
          item.z -= game.speed * dt;
          if (item.kind !== 'enemy') continue;

          if (item.enemyType === 'knight' && !item.jumped && item.z < 12) {
            item.lane = trailKnightJumpLane(item.lane, game.lane);
            item.jumped = true;
          }

          if (item.enemyType === 'bishop' && !item.aimed && item.z < BISHOP_AIM_Z) {
            item.aimed = true;
            item.aimLane = trailBishopTargetLane(item.lane, game.lane);
            item.aimUntil = now + BISHOP_AIM_MS;
            setToast(game, 'ALFIL · diagonal marcada. Muévete o para el disparo.', now, 900);
          } else if (item.enemyType === 'bishop' && item.aimed && !item.fired && now >= item.aimUntil) {
            item.fired = true;
            if (game.lane === item.aimLane) {
              loseLife(game, now, 'El alfil te ha cosido en diagonal. Eso sí estaba anunciado.');
            } else {
              setToast(game, 'El disparo del alfil ha pasado de largo.', now, 850);
            }
          }
        }

        for (const item of [...game.objects].sort((a, b) => a.z - b.z)) {
          if (item.z > COLLISION_Z || item.lane !== game.lane) continue;
          if (item.kind === 'power') {
            game.power = item.power;
            game.powerUntil = now + TRAIL_POWER_DURATION_MS;
            game.score += 80;
            removeObject(game, item.id);
            setToast(game, `${trailPowerLabel(item.power)} · movimiento desbloqueado`, now, 1400);
          } else if (item.kind === 'enemy' && item.enemyType === 'pawn') {
            game.phase = 'duel';
            game.duel = { enemyId: item.id, meter: 24, timeLeft: 2.6, direction: game.lane === TRAIL_LANES - 1 ? -1 : 1 };
            setToast(game, '¡FRONTAL! Machaca ESPACIO.', now, 1000);
          } else if (item.kind === 'enemy' && item.enemyType === 'knight') {
            removeObject(game, item.id);
            loseLife(game, now, 'El caballo ha saltado sobre tu línea. Previsible después de verlo.');
          } else if (item.kind === 'enemy' && item.enemyType === 'bishop') {
            removeObject(game, item.id);
            loseLife(game, now, 'El alfil ha cerrado la diagonal. Muy litúrgico todo.');
          } else if (item.kind === 'enemy' && item.enemyType === 'rook') {
            removeObject(game, item.id);
            loseLife(game, now, 'Una torre de frente. Ni siquiera tú eres tan cabezón, Matthias.');
          } else {
            removeObject(game, item.id);
            loseLife(game, now, 'Eso era un obstáculo, general.');
          }
        }
        game.objects = game.objects.filter((item) => item.z > -2);
      } else if (game.phase === 'duel' && game.duel) {
        game.duel.meter = trailDuelDecay(game.duel.meter, dt);
        game.duel.timeLeft -= dt;
        if (game.duel.timeLeft <= 0) {
          const enemy = game.objects.find((item) => item.id === game.duel?.enemyId);
          if (enemy) removeObject(game, enemy.id);
          loseLife(game, now, 'El otro peón te ha echado para atrás. Vergüenza administrativa.');
        }
      }

      const { width, height } = resize();
      drawTrack(ctx, width, height);
      for (const item of [...game.objects].sort((a, b) => b.z - a.z)) {
        drawObject(ctx, item, spriteRef.current, width, height, now, game);
      }
      drawMatthias(ctx, spriteRef.current, game, width, height, now);

      if (game.phase === 'duel' && game.duel) {
        ctx.fillStyle = 'rgba(0,0,0,.76)';
        ctx.fillRect(width * 0.2, height * 0.12, width * 0.6, 76);
        ctx.fillStyle = '#f3e7c2';
        ctx.font = '700 15px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('EMPUJA AL PEÓN · ESPACIO', width / 2, height * 0.12 + 24);
        ctx.fillStyle = '#3b2d27';
        ctx.fillRect(width * 0.27, height * 0.12 + 38, width * 0.46, 15);
        ctx.fillStyle = '#c9a227';
        ctx.fillRect(width * 0.27, height * 0.12 + 38, width * 0.46 * (game.duel.meter / 100), 15);
      }

      if (now - hudAt > 90) {
        hudAt = now;
        setHud({
          phase: game.phase,
          lane: game.lane,
          lives: game.lives,
          score: Math.floor(game.score),
          distance: Math.floor(game.distance),
          speed: game.speed,
          power: game.power,
          powerLeft: game.power ? Math.max(0, game.powerUntil - now) : 0,
          combo: game.combo,
          captures: game.captures,
          duel: game.duel ? { ...game.duel } : null,
          toast: now < game.toastUntil || game.phase === 'ready' || game.phase === 'gameover' ? game.toast : '',
        });
      }
      frame = requestAnimationFrame(update);
    }

    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    function onKeyDown(event) {
      if (!['ArrowLeft', 'ArrowRight', ' ', 'Spacebar'].includes(event.key)) return;
      event.preventDefault();
      const game = gameRef.current;
      const now = performance.now();
      if (game.phase === 'ready' || game.phase === 'gameover') {
        if (event.key === ' ' || event.key === 'Spacebar') startRun();
        return;
      }

      if (game.phase === 'running' && (event.key === ' ' || event.key === 'Spacebar')) {
        const sniper = game.objects.find((item) => (
          item.kind === 'enemy'
          && item.enemyType === 'bishop'
          && item.aimed
          && !item.fired
          && item.aimLane === game.lane
        ));
        if (sniper && trailBishopParryReady(sniper.aimUntil, now)) {
          sniper.fired = true;
          game.score += 120;
          game.slashUntil = now + 360;
          setToast(game, 'PARADA · +120. Nein.', now, 900);
        } else if (sniper) {
          setToast(game, 'Aún no. Espera el destello del alfil.', now, 700);
        }
        return;
      }

      if (game.phase === 'duel' && game.duel) {
        if (event.key === 'ArrowLeft') game.duel.direction = trailDuelDirection(game.lane, -1);
        else if (event.key === 'ArrowRight') game.duel.direction = trailDuelDirection(game.lane, 1);
        else {
          game.duel.meter = trailDuelPress(game.duel.meter);
          if (game.duel.meter >= 100) {
            const enemy = game.objects.find((item) => item.id === game.duel.enemyId);
            if (enemy) {
              const direction = trailDuelDirection(game.lane, game.duel.direction);
              finishCapture(game, enemy, game.lane + direction, now);
            }
          }
        }
        return;
      }
      if (game.phase !== 'running' || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;

      const direction = event.key === 'ArrowLeft' ? -1 : 1;
      const targetLane = game.lane + direction;
      if (targetLane < 0 || targetLane >= TRAIL_LANES) return;

      if (game.power) {
        const nextLane = trailPowerLane({ lane: game.lane, direction, power: game.power });
        const victim = nearestObject(game, nextLane);
        if (victim && (game.power === 'bishop' || game.power === 'queen')) {
          if (victim.kind === 'enemy') finishCapture(game, victim, nextLane, now);
          else {
            removeObject(game, victim.id);
            game.score += 70;
            game.slashUntil = now + 250;
            game.lane = nextLane;
          }
          return;
        }
        game.lane = nextLane;
        return;
      }

      const enemy = nearestObject(game, targetLane, 'enemy');
      if (enemy) {
        finishCapture(game, enemy, targetLane, now);
      } else {
        setToast(game, 'Nein. Un peón no se mueve de lado.', now, 900);
      }
    }

    window.addEventListener('keydown', onKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function startRun() {
    musicStopRef.current();
    duckAmbientMusic(true);
    musicStopRef.current = createArcadeMusic(musicRef.current);
    const game = createGame();
    game.phase = 'running';
    game.toast = 'Vorwärts.';
    game.toastUntil = performance.now() + 1100;
    game.lastTime = performance.now();
    gameRef.current = game;
    setHud({ ...game });
  }

  function switchMusic(next) {
    setMusic(next);
    musicRef.current = next;
    if (gameRef.current.phase === 'running' || gameRef.current.phase === 'duel') {
      musicStopRef.current();
      musicStopRef.current = createArcadeMusic(next);
    }
  }

  return (
    <div className="pawn-trailblazer" data-pawn-trailblazer="true">
      <div className="pawn-trailblazer-head">
        <div>
          <span className="section-label">EXPERIMENTO ARCADE · POC</span>
          <h2>Pawn Trailblazer</h2>
          <p>Matthias avanza solo. Peones forcejean, caballos saltan, alfiles marcan diagonales y las torres te pasan por encima si las recibes de frente. Captura en diagonal para encadenar combo.</p>
        </div>
        <button type="button" className="secondary-btn" onClick={onExit}>← Experimentos</button>
      </div>

      <div className="pawn-trailblazer-shell">
        <div className="pawn-trailblazer-hud" aria-live="polite">
          <span>VIDAS <b>{'♥'.repeat(Math.max(0, hud.lives || 0)) || '—'}</b></span>
          <span>DISTANCIA <b>{hud.distance || 0} m</b></span>
          <span>PUNTOS <b>{hud.score || 0}</b></span>
          <span>COMBO <b>{hud.combo > 1 ? `x${hud.combo}` : '—'}</b></span>
          <span>FORMA <b>{trailPowerLabel(hud.power)}</b></span>
        </div>

        <div className="pawn-trailblazer-stage">
          <canvas ref={canvasRef} aria-label="Corredor pseudo 3D de Pawn Trailblazer" />
          {(hud.phase === 'ready' || hud.phase === 'gameover') && (
            <div className="pawn-trailblazer-overlay">
              <img src={TRAIL_SPRITES.matthiasRun} alt="Matthias corredor" />
              <span>{hud.phase === 'gameover' ? 'FIN DE MANIOBRAS' : 'GENERAL MATTHIAS VON LOPSTEIN'}</span>
              <strong>{hud.phase === 'gameover' ? `${hud.distance || 0} m · ${hud.score || 0} puntos · ${hud.captures || 0} capturas` : 'Nací peón. Siempre seré peón.'}</strong>
              <button type="button" className="primary-btn" onClick={startRun}>{hud.phase === 'gameover' ? 'Otra vez' : 'Iniciar carrera'}</button>
              <small>También puedes pulsar ESPACIO.</small>
            </div>
          )}
          {hud.toast && hud.phase !== 'ready' && hud.phase !== 'gameover' && <div className="pawn-trailblazer-toast">{hud.toast}</div>}
        </div>

        <div className="pawn-trailblazer-controls">
          <div><kbd>←</kbd><kbd>→</kbd><span>Captura diagonal. Con powerup, maniobra.</span></div>
          <div><kbd>ESPACIO</kbd><span>Forcejea contra peones o para el disparo de un alfil al final de su carga.</span></div>
          <div className="pawn-trailblazer-music"><span>BSO</span><button type="button" className={music === 'synthmetal' ? 'active' : ''} onClick={() => switchMusic('synthmetal')}>Synthmetal</button><button type="button" className={music === 'classical' ? 'active' : ''} onClick={() => switchMusic('classical')}>Clásica</button></div>
        </div>
        <p className="pawn-trailblazer-note">Arte de la POC: sprites WebP aprobados de Matthias, enemigos y powerups. El modo sigue aislado: no toca rating ni progreso competitivo.</p>
      </div>
    </div>
  );
}
