import * as THREE from 'three';
import { duckAmbientMusic } from './sound.js';
import {
  PAWN_SLUG_ENEMIES,
  PAWN_SLUG_PICKUPS,
  PAWN_SLUG_PLAYER,
  PAWN_SLUG_SPAWNS,
  PAWN_SLUG_WEAPON_ORDER,
  PAWN_SLUG_WEAPONS,
  PAWN_SLUG_WORLD,
  pawnSlugAmmoForPickup,
  pawnSlugDamageMultiplier,
  pawnSlugLevelForXp,
  pawnSlugLevelProgress,
  pawnSlugMatthiasLine,
  pawnSlugMaxHpForLevel,
  pawnSlugPickupCopy,
  pawnSlugScoreForKill,
  pawnSlugWeaponLabel,
  pawnSlugWeaponShortLabel,
  pawnSlugWeaponStatsForLevel,
  pawnSlugWeaponUpgradeCrossed,
  pawnSlugXpForKill,
  pawnSlugXpForLevel,
} from './pawnSlug.js';
import {
  animateSlugEnemy,
  createExplosionParticle,
  createGrenadeModel,
  createMatthiasSlugModel,
  createPickupModel,
  createSlugEnemyModel,
  createSlugEnvironment,
  disposePawnSlugObject,
} from './pawnSlugArt.js';
import { createPawnSlugPremiumLandmarks } from './pawnSlugLandmarks.js';
import { pawnSlugMatthiasLocomotion } from './pawnSlugMotionPolish.js';
import {
  animatePremiumMuzzleFlash,
  animatePremiumProjectile,
  createPremiumBulletModel,
  createPremiumMuzzleFlash,
} from './pawnSlugPremiumFx.js';
import {
  PAWN_SLUG_STURM_BISHOP_META,
  animateSturmBishopModel,
  createSturmBishopModel,
} from './pawnSlugMidBoss.js';
import { animateMatthiasSlugSprite } from './pawnSlugSprites.js';

const WORLD_SCALE = 1 / 40;
const VIEW_W = 24;
const VIEW_H = 13.5;
const GROUND_Y = 0;
const PLAYER_SPEED = 6.35;
const PLAYER_JUMP = 8.4;
const GRAVITY = 22;
const PLAYER_W = 0.82;
const PLAYER_H = 1.75;
const ENEMY_BULLET_SPEED = 7.2;
const CHECKPOINTS = [110, 1480, 2980, 4140].map((value) => value * WORLD_SCALE);

function wx(value) {
  return value * WORLD_SCALE;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function boxFor(entity, w = entity.w, h = entity.h) {
  return { x: entity.x - w / 2, y: entity.y, w, h };
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function createInitialArsenal() {
  return Object.fromEntries(PAWN_SLUG_WEAPON_ORDER.map((id) => [
    id,
    {
      unlocked: id === 'pistol',
      ammo: id === 'pistol' ? Infinity : 0,
    },
  ]));
}

function initialState() {
  const maxHp = pawnSlugMaxHpForLevel(1);
  return {
    phase: 'ready',
    time: 0,
    missionTime: 0,
    score: 0,
    combo: 0,
    comboUntil: 0,
    cameraX: 0,
    shake: 0,
    hitStop: 0,
    toast: pawnSlugMatthiasLine('start'),
    toastUntil: Infinity,
    spawned: new Set(),
    takenPickups: new Set(),
    enemies: [],
    pickups: [],
    bullets: [],
    grenades: [],
    particles: [],
    flashes: [],
    bossSpawned: false,
    bossDefeated: false,
    checkpoint: CHECKPOINTS[0],
    player: {
      x: CHECKPOINTS[0],
      y: GROUND_Y,
      vx: 0,
      vy: 0,
      dir: 1,
      onGround: true,
      crouch: false,
      hp: maxHp,
      maxHp,
      xp: 0,
      level: 1,
      lives: 3,
      grenades: 4,
      weapon: 'pistol',
      ammo: Infinity,
      arsenal: createInitialArsenal(),
      fireCooldown: 0,
      invuln: 0,
      flash: 0,
      landing: 0,
      recoil: 0,
      moving: false,
      moveStartedAt: 0,
      stoppedAt: Number.NEGATIVE_INFINITY,
    },
  };
}

function createSfx() {
  if (typeof window === 'undefined') return { play() {}, destroy() {} };
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return { play() {}, destroy() {} };
  let ctx = null;
  let master = null;

  function ensure() {
    if (ctx) return ctx;
    ctx = new AudioCtx();
    master = ctx.createGain();
    master.gain.value = 0.055;
    master.connect(ctx.destination);
    return ctx;
  }

  function tone(freq, duration, type = 'square', gainValue = 0.32, slide = 0) {
    const audio = ensure();
    if (audio.state === 'suspended') void audio.resume().catch(() => {});
    const now = audio.currentTime + 0.005;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), now + duration);
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  function noise(duration = 0.12, gainValue = 0.18) {
    const audio = ensure();
    const length = Math.max(1, Math.floor(audio.sampleRate * duration));
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = audio.createBufferSource();
    const gain = audio.createGain();
    source.buffer = buffer;
    gain.gain.value = gainValue;
    source.connect(gain);
    gain.connect(master);
    source.start();
  }

  return {
    play(kind) {
      if (kind === 'pistol') tone(220, 0.055, 'square', 0.22, -100);
      else if (kind === 'machinegun') tone(155, 0.045, 'square', 0.16, -65);
      else if (kind === 'shotgun') { noise(0.12, 0.28); tone(92, 0.12, 'sawtooth', 0.2, -45); }
      else if (kind === 'panzerfaust') { noise(0.22, 0.34); tone(70, 0.2, 'sawtooth', 0.24, -35); }
      else if (kind === 'grenade') { noise(0.28, 0.36); tone(58, 0.24, 'triangle', 0.3, -25); }
      else if (kind === 'hit') tone(105, 0.06, 'square', 0.13, -35);
      else if (kind === 'pickup') { tone(440, 0.08, 'square', 0.15, 220); setTimeout(() => tone(660, 0.09, 'square', 0.12, 220), 45); }
      else if (kind === 'levelUp') { tone(392, 0.08, 'triangle', 0.16, 120); setTimeout(() => tone(523, 0.09, 'triangle', 0.14, 160), 70); setTimeout(() => tone(784, 0.12, 'triangle', 0.12, 120), 145); }
      else if (kind === 'hurt') { noise(0.08, 0.14); tone(84, 0.13, 'sawtooth', 0.18, -30); }
      else if (kind === 'boss') { tone(55, 0.32, 'sawtooth', 0.22, 22); setTimeout(() => tone(73, 0.32, 'sawtooth', 0.18, -18), 180); }
    },
    destroy() {
      if (!ctx) return;
      try { master?.disconnect(); } catch {}
      void ctx.close().catch(() => {});
      ctx = null;
      master = null;
    },
  };
}

function arsenalHud(player) {
  return PAWN_SLUG_WEAPON_ORDER.map((id) => {
    const weapon = PAWN_SLUG_WEAPONS[id];
    const slot = player.arsenal[id];
    return {
      id,
      slot: weapon.slot,
      shortLabel: pawnSlugWeaponShortLabel(id),
      label: weapon.label,
      current: player.weapon === id,
      unlocked: Boolean(slot?.unlocked),
      ammo: id === 'pistol' ? null : Math.max(0, Math.ceil(slot?.ammo || 0)),
    };
  });
}

function hud(state) {
  const boss = state.enemies.find((enemy) => enemy.type === 'boss' && !enemy.dead);
  const midBoss = state.enemies.find((enemy) => enemy.type === 'bishop' && !enemy.dead);
  const player = state.player;
  const nextLevelXp = player.level >= PAWN_SLUG_PLAYER.maxLevel ? null : pawnSlugXpForLevel(player.level + 1);
  return {
    phase: state.phase,
    hp: Math.max(0, Math.ceil(player.hp)),
    maxHp: Math.max(1, Math.ceil(player.maxHp)),
    level: player.level,
    xp: Math.max(0, Math.floor(player.xp)),
    xpProgress: pawnSlugLevelProgress(player.xp, player.level),
    xpToNext: nextLevelXp == null ? null : Math.max(0, nextLevelXp - player.xp),
    lives: player.lives,
    weapon: player.weapon,
    weaponLabel: pawnSlugWeaponLabel(player.weapon),
    ammo: Number.isFinite(player.ammo) ? Math.max(0, Math.ceil(player.ammo)) : null,
    weapons: arsenalHud(player),
    grenades: player.grenades,
    score: Math.floor(state.score),
    combo: state.combo,
    progress: clamp(player.x / wx(PAWN_SLUG_WORLD.extractionX), 0, 1),
    midBossHp: midBoss ? Math.max(0, Math.ceil(midBoss.hp)) : null,
    midBossMaxHp: midBoss?.maxHp || null,
    midBossLabel: midBoss ? PAWN_SLUG_STURM_BISHOP_META.label : null,
    bossHp: boss ? Math.max(0, Math.ceil(boss.hp)) : null,
    bossMaxHp: boss?.maxHp || null,
    toast: state.time <= state.toastUntil || ['ready', 'gameover', 'victory'].includes(state.phase) ? state.toast : '',
    missionTime: Math.floor(state.missionTime),
  };
}

export function createPawnSlugGame(host, { onReady, onHud } = {}) {
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

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x141921);
  scene.fog = new THREE.Fog(0x161b23, 25, 76);

  const camera = new THREE.OrthographicCamera(-VIEW_W / 2, VIEW_W / 2, VIEW_H / 2, -VIEW_H / 2, 0.1, 80);
  camera.position.set(VIEW_W / 2, 5.1, 15);
  camera.lookAt(VIEW_W / 2, 4.25, 0);

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
  const dynamic = new THREE.Group();
  const projectileLayer = new THREE.Group();
  const fxLayer = new THREE.Group();
  scene.add(dynamic, projectileLayer, fxLayer);

  const playerModel = createMatthiasSlugModel();
  scene.add(playerModel);

  let state = initialState();
  let destroyed = false;
  let visible = document.visibilityState !== 'hidden';
  let inViewport = true;
  let frame = 0;
  let previous = performance.now();
  let lastHudAt = 0;
  let ambientDucked = false;
  const input = {
    left: false,
    right: false,
    jump: false,
    fire: false,
    firePressed: false,
    grenade: false,
    crouch: false,
  };
  const sfx = createSfx();

  function setAmbientDuck(enabled) {
    if (ambientDucked === enabled) return;
    ambientDucked = enabled;
    duckAmbientMusic(enabled);
  }

  function emitHud(force = false) {
    const now = performance.now();
    if (!force && now - lastHudAt < 90) return;
    lastHudAt = now;
    onHud?.(hud(state));
  }

  function setToast(text, seconds = 2.4) {
    state.toast = text;
    state.toastUntil = state.time + seconds;
    emitHud(true);
  }

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

  function resetInput() {
    for (const key of Object.keys(input)) input[key] = false;
  }

  function placePlayer() {
    playerModel.position.set(state.player.x, state.player.y, 0.2);
    playerModel.visible = state.phase !== 'gameover';
  }

  function weaponAvailable(player, id) {
    const slot = player.arsenal[id];
    return Boolean(slot?.unlocked && (id === 'pistol' || slot.ammo > 0));
  }

  function syncCurrentWeaponAmmo(player) {
    const slot = player.arsenal[player.weapon];
    if (slot) slot.ammo = player.ammo;
  }

  function selectWeapon(id, { announce = true } = {}) {
    const player = state.player;
    if (!PAWN_SLUG_WEAPONS[id] || !weaponAvailable(player, id)) return false;
    if (player.weapon !== id) syncCurrentWeaponAmmo(player);
    player.weapon = id;
    player.ammo = player.arsenal[id].ammo;
    playerModel.userData.setWeapon?.(id);
    if (announce) {
      const upgrade = pawnSlugWeaponStatsForLevel(id, player.level);
      setToast(`ARMA // ${pawnSlugWeaponLabel(id)} · ${upgrade.upgradeCode}`, 1.15);
    }
    emitHud(true);
    return true;
  }

  function cycleWeapon(direction) {
    const player = state.player;
    const available = PAWN_SLUG_WEAPON_ORDER.filter((id) => weaponAvailable(player, id));
    if (available.length < 2) return false;
    const current = Math.max(0, available.indexOf(player.weapon));
    const next = available[(current + direction + available.length) % available.length];
    return selectWeapon(next);
  }

  function grantWeapon(id) {
    const weapon = PAWN_SLUG_WEAPONS[id];
    const slot = state.player.arsenal[id];
    if (!weapon || !slot) return false;
    slot.unlocked = true;
    const pickupAmmo = pawnSlugAmmoForPickup(id, state.player.level);
    if (Number.isFinite(pickupAmmo)) slot.ammo += pickupAmmo;
    else slot.ammo = Infinity;
    selectWeapon(id, { announce: false });
    return true;
  }

  function startMission() {
    resetDynamic();
    resetInput();
    state = initialState();
    state.phase = 'playing';
    state.toast = pawnSlugMatthiasLine('start');
    state.toastUntil = 3.5;
    state.time = 0;
    state.missionTime = 0;
    playerModel.userData.setWeapon?.('pistol');
    placePlayer();
    camera.position.x = VIEW_W / 2;
    state.cameraX = VIEW_W / 2;
    setAmbientDuck(true);
    emitHud(true);
  }

  function nearestCheckpoint(x) {
    let result = CHECKPOINTS[0];
    for (const checkpoint of CHECKPOINTS) if (checkpoint <= x) result = checkpoint;
    return result;
  }

  function createEnemy(spawn) {
    const stats = PAWN_SLUG_ENEMIES[spawn.type];
    const midBoss = spawn.type === 'bishop';
    const model = midBoss ? createSturmBishopModel() : createSlugEnemyModel(spawn.type);
    const x = wx(spawn.x);
    model.position.set(x, 0, midBoss ? 0.08 : 0);
    dynamic.add(model);
    const enemy = {
      id: spawn.id,
      type: spawn.type,
      x,
      y: 0,
      w: stats.width * WORLD_SCALE * 0.92,
      h: Math.max(1.25, stats.height * WORLD_SCALE),
      hp: stats.hp,
      maxHp: stats.hp,
      speed: stats.speed * WORLD_SCALE,
      score: stats.score,
      dir: -1,
      vx: 0,
      vy: 0,
      onGround: true,
      fireCooldown: midBoss ? 0.75 : 0.45 + Math.random() * 0.8,
      shellCooldown: midBoss ? 1.65 + Math.random() * 0.45 : null,
      leapCooldown: 0.7 + Math.random() * 1.2,
      hurt: 0,
      dead: false,
      model,
    };
    state.enemies.push(enemy);
    if (midBoss) {
      state.hitStop = Math.max(state.hitStop, reducedMotion ? 0 : 0.08);
      state.shake = Math.max(state.shake, reducedMotion ? 0 : 0.18);
      setToast(`${PAWN_SLUG_STURM_BISHOP_META.label} // ${pawnSlugMatthiasLine('midBoss')}`, 3);
      sfx.play('boss');
    }
    return enemy;
  }

  function createBoss() {
    if (state.bossSpawned || state.bossDefeated) return;
    state.bossSpawned = true;
    const stats = PAWN_SLUG_ENEMIES.boss;
    const model = createSlugEnemyModel('boss');
    const x = wx(PAWN_SLUG_WORLD.bossX);
    model.position.set(x, 0, -0.15);
    dynamic.add(model);
    state.enemies.push({
      id: 'boss-panzer-rook', type: 'boss', x, y: 0, w: 4.6, h: 3.2,
      hp: stats.hp, maxHp: stats.hp, speed: 0, score: stats.score, dir: -1,
      vx: 0, vy: 0, onGround: true, fireCooldown: 0.7, shellCooldown: 1.55,
      hurt: 0, dead: false, model,
    });
    state.hitStop = reducedMotion ? 0 : 0.18;
    state.shake = reducedMotion ? 0 : 0.45;
    setToast(pawnSlugMatthiasLine('boss'), 3.2);
    sfx.play('boss');
  }

  function createPickup(pickup, index) {
    if (state.takenPickups.has(index)) return;
    const model = createPickupModel(pickup.type);
    const x = wx(pickup.x);
    model.position.set(x, 0.18, 0.35);
    dynamic.add(model);
    state.pickups.push({ id: index, type: pickup.type, x, y: 0.18, w: 0.9, h: 0.9, model, bob: Math.random() * Math.PI * 2 });
  }

  function spawnAhead() {
    const right = camera.position.x + VIEW_W * 0.72;
    for (const spawn of PAWN_SLUG_SPAWNS) {
      if (state.spawned.has(spawn.id)) continue;
      const x = wx(spawn.x);
      if (x <= right) {
        state.spawned.add(spawn.id);
        createEnemy(spawn);
      }
    }
    for (let index = 0; index < PAWN_SLUG_PICKUPS.length; index += 1) {
      if (state.takenPickups.has(index) || state.pickups.some((pickup) => pickup.id === index)) continue;
      if (wx(PAWN_SLUG_PICKUPS[index].x) <= right) createPickup(PAWN_SLUG_PICKUPS[index], index);
    }
    if (state.player.x >= wx(PAWN_SLUG_WORLD.bossX - 720)) createBoss();
  }

  function addFlash(x, y, dir = 1, weapon = 'pistol', enemy = false) {
    const model = createPremiumMuzzleFlash({ enemy, weapon });
    model.position.set(x, y, 0.35);
    model.scale.x *= dir;
    fxLayer.add(model);
    const life = model.userData.life || 0.07;
    state.flashes.push({ model, life, maxLife: life });
  }

  function addBullet({ x, y, vx, vy = 0, damage, enemy = false, explosive = false, life = 2.8, weapon = 'pistol' }) {
    const model = createPremiumBulletModel({ enemy, explosive, weapon });
    model.position.set(x, y, 0.3);
    if (vx < 0) model.scale.x = -1;
    projectileLayer.add(model);
    state.bullets.push({ x, y, vx, vy, damage, enemy, explosive, life, weapon, w: explosive ? 0.45 : 0.15, h: explosive ? 0.22 : 0.12, model });
  }

  function firePlayerWeapon() {
    const player = state.player;
    if (player.fireCooldown > 0 || state.phase !== 'playing') return false;
    const weaponId = player.weapon;
    const weapon = pawnSlugWeaponStatsForLevel(weaponId, player.level);
    if (Number.isFinite(player.ammo) && player.ammo <= 0) {
      selectWeapon('pistol', { announce: false });
      setToast('Munición agotada. Vuelta al hierro reglamentario.', 1.7);
      return false;
    }

    player.fireCooldown = weapon.cadence / 1000;
    player.recoil = weaponId === 'panzerfaust' ? 0.12 : weaponId === 'shotgun' ? 0.085 : weaponId === 'machinegun' ? 0.04 : 0.055;
    if (Number.isFinite(player.ammo)) {
      player.ammo -= 1;
      player.arsenal[weaponId].ammo = player.ammo;
    }
    const dir = player.dir;
    const muzzleX = player.x + dir * 1.05;
    const muzzleY = player.y + (player.crouch ? 0.72 : 1.12);
    const baseSpeed = weapon.speed * WORLD_SCALE;
    const damage = weapon.damage;
    for (let pellet = 0; pellet < weapon.pellets; pellet += 1) {
      const spread = (Math.random() * 2 - 1) * weapon.spread;
      addBullet({
        x: muzzleX,
        y: muzzleY,
        vx: dir * baseSpeed * Math.cos(spread),
        vy: baseSpeed * Math.sin(spread),
        damage,
        explosive: Boolean(weapon.explosive),
        weapon: weaponId,
      });
    }
    addFlash(muzzleX, muzzleY, dir, weaponId, false);
    sfx.play(weaponId);

    if (Number.isFinite(player.ammo) && player.ammo <= 0) {
      selectWeapon('pistol', { announce: false });
      setToast(`${weapon.label}: seco. Pistola.`, 1.35);
    }
    emitHud(true);
    return true;
  }

  function throwGrenade() {
    const player = state.player;
    if (player.grenades <= 0 || state.phase !== 'playing') return;
    player.grenades -= 1;
    const model = createGrenadeModel();
    const grenade = {
      x: player.x + player.dir * 0.65,
      y: player.y + 1.12,
      vx: player.dir * 6.8,
      vy: 7.5,
      fuse: 1.35,
      model,
    };
    model.position.set(grenade.x, grenade.y, 0.35);
    projectileLayer.add(model);
    state.grenades.push(grenade);
    setToast(pawnSlugMatthiasLine('grenade'), 1.35);
  }

  function fireEnemy(enemy, explosive = false) {
    const dir = enemy.x >= state.player.x ? -1 : 1;
    const y = enemy.y + (enemy.type === 'boss' ? 1.9 : enemy.type === 'bishop' ? 1.55 : enemy.type === 'rook' ? 1.15 : 0.88);
    const speed = explosive ? 5.6 : ENEMY_BULLET_SPEED;
    const targetDy = (state.player.y + 0.8) - y;
    const distance = Math.max(1, Math.abs(state.player.x - enemy.x));
    const vy = clamp(targetDy / distance * speed, -2.4, 2.4);
    const muzzleOffset = enemy.type === 'boss' ? 2 : enemy.type === 'bishop' ? 1.05 : 0.7;
    addBullet({ x: enemy.x + dir * muzzleOffset, y, vx: dir * speed, vy, damage: explosive ? (enemy.type === 'bishop' ? 24 : 30) : (enemy.type === 'bishop' ? 15 : 13), enemy: true, explosive, life: 4, weapon: 'enemy' });
    addFlash(enemy.x + dir * muzzleOffset, y, dir, explosive ? 'panzerfaust' : 'pistol', true);
  }

  function burst(x, y, strength = 1, fiery = true) {
    const count = reducedMotion ? 7 : Math.round(13 * strength);
    for (let i = 0; i < count; i += 1) {
      const color = fiery ? (i % 3 === 0 ? 0xffdb6e : i % 3 === 1 ? 0xff7b37 : 0x5f6368) : 0x8c9196;
      const model = createExplosionParticle(color, 0.055 + Math.random() * 0.09 * strength);
      const angle = Math.random() * Math.PI * 2;
      const speed = (1.6 + Math.random() * 4.8) * strength;
      const particle = { x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed + 1.5, life: 0.35 + Math.random() * 0.55, maxLife: 0.9, model };
      model.position.set(x, y, 0.6 + Math.random() * 0.45);
      fxLayer.add(model);
      state.particles.push(particle);
    }
    state.shake = Math.max(state.shake, reducedMotion ? 0 : 0.14 * strength);
  }

  function explode(x, y, radius = 2.2, damage = 90, hurtsPlayer = false) {
    burst(x, y, 1.55, true);
    sfx.play('grenade');
    for (const enemy of state.enemies) {
      if (enemy.dead) continue;
      const distance = Math.hypot(enemy.x - x, (enemy.y + enemy.h * 0.5) - y);
      if (distance <= radius) damageEnemy(enemy, damage * (1 - distance / (radius * 1.35)));
    }
    if (hurtsPlayer) {
      const distance = Math.hypot(state.player.x - x, (state.player.y + PLAYER_H * 0.5) - y);
      if (distance <= radius * 0.75) hurtPlayer(24);
    }
  }

  function grantXp(type) {
    const gained = pawnSlugXpForKill(type);
    if (!gained) return;
    const player = state.player;
    const previousLevel = player.level;
    player.xp += gained;
    player.level = pawnSlugLevelForXp(player.xp);
    if (player.level <= previousLevel) return;

    const previousMaxHp = player.maxHp;
    player.maxHp = pawnSlugMaxHpForLevel(player.level);
    player.hp = Math.min(player.maxHp, player.hp + (player.maxHp - previousMaxHp) + 24);
    state.score += (player.level - previousLevel) * 250;
    state.hitStop = Math.max(state.hitStop, reducedMotion ? 0 : 0.08);
    state.shake = Math.max(state.shake, reducedMotion ? 0 : 0.1);
    sfx.play('levelUp');

    const promotions = PAWN_SLUG_WEAPON_ORDER
      .filter((id) => player.arsenal[id]?.unlocked)
      .map((id) => ({ id, upgrade: pawnSlugWeaponUpgradeCrossed(id, previousLevel, player.level) }))
      .filter(({ upgrade }) => Boolean(upgrade));
    const promotionCopy = promotions
      .map(({ id, upgrade }) => `${pawnSlugWeaponShortLabel(id)} ${upgrade.code}`)
      .join(' · ');
    if (promotionCopy) setToast(`NIVEL ${player.level} // ${promotionCopy}. ${pawnSlugMatthiasLine('weaponUp')}`, 3.1);
    else setToast(`NIVEL ${player.level} // ${pawnSlugMatthiasLine('levelUp')}`, 2.6);
  }

  function damageEnemy(enemy, amount) {
    if (enemy.dead) return;
    enemy.hp -= amount;
    enemy.hurt = 0.11;
    sfx.play('hit');
    if (enemy.hp > 0) return;
    enemy.dead = true;
    state.score += pawnSlugScoreForKill(enemy.type) * Math.max(1, state.combo || 1);
    state.combo = state.time <= state.comboUntil ? Math.min(9, state.combo + 1) : 1;
    state.comboUntil = state.time + 2.2;
    grantXp(enemy.type);
    state.hitStop = Math.max(state.hitStop, reducedMotion ? 0 : enemy.type === 'boss' ? 0.22 : enemy.type === 'bishop' ? 0.11 : 0.035);
    burst(enemy.x, enemy.y + enemy.h * 0.5, enemy.type === 'boss' ? 2.4 : enemy.type === 'bishop' ? 1.45 : 0.9, true);
    enemy.model.visible = false;
    if (enemy.type === 'bishop') {
      state.score += 500;
      state.shake = Math.max(state.shake, reducedMotion ? 0 : 0.28);
    }
    if (enemy.type === 'boss') {
      state.bossDefeated = true;
      state.score += 2500;
      setToast(pawnSlugMatthiasLine('bossDown'), 3);
      state.shake = reducedMotion ? 0 : 0.65;
    }
  }

  function hurtPlayer(amount) {
    const player = state.player;
    if (player.invuln > 0 || state.phase !== 'playing') return;
    player.hp -= amount;
    player.invuln = 0.85;
    player.flash = 0.18;
    state.shake = reducedMotion ? 0 : 0.22;
    state.hitStop = Math.max(state.hitStop, reducedMotion ? 0 : 0.05);
    sfx.play('hurt');
    setToast(pawnSlugMatthiasLine('hurt'), 1.45);
    if (player.hp > 0) return;

    player.lives -= 1;
    if (player.lives <= 0) {
      state.phase = 'gameover';
      playerModel.visible = false;
      setAmbientDuck(false);
      setToast(pawnSlugMatthiasLine('death'), Infinity);
      emitHud(true);
      return;
    }

    state.checkpoint = nearestCheckpoint(player.x);
    player.x = state.checkpoint;
    player.y = 0;
    player.vx = 0;
    player.vy = 0;
    player.hp = player.maxHp;
    player.invuln = 1.8;
    player.moving = false;
    player.stoppedAt = state.time;
    selectWeapon('pistol', { announce: false });
    camera.position.x = Math.max(VIEW_W / 2, player.x + VIEW_W * 0.14);
    setToast(`Vida menos. Reagrupando en ${Math.round(player.x / WORLD_SCALE)} m. Pistola fuera.`, 2.2);
  }

  function animatePlayer() {
    const player = state.player;
    const base = Math.abs(playerModel.userData.baseScale || playerModel.scale.x || 1);
    playerModel.scale.x = base * (player.dir < 0 ? -1 : 1);
    animateMatthiasSlugSprite(playerModel, {
      time: state.time,
      running: Math.abs(player.vx) > 0.7 && player.onGround,
      crouch: player.crouch,
      airborne: !player.onGround,
      firing: player.recoil > 0,
      dir: player.dir,
      hurt: player.flash > 0,
    });

    if (player.onGround && !player.crouch) {
      const locomotion = pawnSlugMatthiasLocomotion({
        time: state.time,
        moving: player.moving,
        speedRatio: Math.abs(player.vx) / PLAYER_SPEED,
        moveStartedAt: player.moveStartedAt,
        stoppedAt: player.stoppedAt,
      });
      if (locomotion.action === 'walk') {
        const frameIndex = locomotion.frame ?? Math.floor(state.time * 8.4) % 9;
        playerModel.userData.setActionFrame?.('walk', frameIndex);
      }
    }

    if (player.landing > 0 && !reducedMotion) {
      const landing = clamp(player.landing / 0.12, 0, 1);
      playerModel.scale.y *= 1 - landing * 0.055;
      playerModel.scale.x *= 1 + landing * 0.035;
    }
  }

  function updatePlayer(dt) {
    const player = state.player;
    player.fireCooldown = Math.max(0, player.fireCooldown - dt);
    player.invuln = Math.max(0, player.invuln - dt);
    player.flash = Math.max(0, player.flash - dt);
    player.recoil = Math.max(0, player.recoil - dt);
    player.landing = Math.max(0, player.landing - dt);
    player.crouch = input.crouch && player.onGround;

    const axis = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (axis) player.dir = axis;
    const speed = PLAYER_SPEED * (player.crouch ? 0.3 : 1);
    const targetVx = axis * speed;
    const response = axis
      ? (player.onGround ? 11.5 : 5.4)
      : (player.onGround ? 8.2 : 2.25);
    player.vx += (targetVx - player.vx) * (1 - Math.exp(-response * dt));

    if (input.jump && player.onGround && !player.crouch) {
      player.vy = PLAYER_JUMP;
      player.onGround = false;
      input.jump = false;
    }

    const wasOnGround = player.onGround;
    player.vy -= GRAVITY * dt;
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    if (player.y <= GROUND_Y) {
      player.y = GROUND_Y;
      player.vy = 0;
      player.onGround = true;
      if (!wasOnGround) player.landing = 0.12;
    }

    const movingNow = Math.abs(player.vx) > 0.18 && player.onGround && !player.crouch;
    if (movingNow && !player.moving) player.moveStartedAt = state.time;
    if (!movingNow && player.moving) player.stoppedAt = state.time;
    player.moving = movingNow;

    const blockingMidBoss = state.enemies.find((enemy) => enemy.type === 'bishop' && !enemy.dead && player.x <= enemy.x && enemy.x - player.x < 7.5);
    if (blockingMidBoss) player.x = Math.min(player.x, blockingMidBoss.x - 1.3);

    const bossAlive = state.enemies.some((enemy) => enemy.type === 'boss' && !enemy.dead);
    const bossArenaLeft = wx(PAWN_SLUG_WORLD.bossX - 570);
    const bossArenaRight = wx(PAWN_SLUG_WORLD.bossX + 500);
    if (bossAlive && player.x > bossArenaLeft) player.x = clamp(player.x, bossArenaLeft, bossArenaRight);
    else player.x = clamp(player.x, CHECKPOINTS[0], wx(PAWN_SLUG_WORLD.extractionX));

    const weapon = PAWN_SLUG_WEAPONS[player.weapon] || PAWN_SLUG_WEAPONS.pistol;
    const wantsFire = weapon.trigger === 'auto' ? input.fire : input.firePressed;
    if (wantsFire) firePlayerWeapon();
    input.firePressed = false;

    if (input.grenade) {
      throwGrenade();
      input.grenade = false;
    }

    state.checkpoint = nearestCheckpoint(player.x);
    playerModel.position.set(player.x, player.y, 0.2);
    playerModel.visible = !(player.invuln > 0 && Math.floor(state.time * 18) % 2 === 0);
    animatePlayer();
  }

  function updateEnemies(dt) {
    const player = state.player;
    for (const enemy of state.enemies) {
      if (enemy.dead) continue;
      enemy.hurt = Math.max(0, enemy.hurt - dt);
      enemy.fireCooldown -= dt;
      enemy.leapCooldown = Math.max(0, (enemy.leapCooldown || 0) - dt);
      const dx = player.x - enemy.x;
      const distance = Math.abs(dx);
      enemy.dir = dx >= 0 ? 1 : -1;

      if (enemy.type === 'pawn') {
        enemy.vx = distance > 4.6 ? enemy.dir * enemy.speed : 0;
        if (distance < 9 && enemy.fireCooldown <= 0) {
          fireEnemy(enemy);
          enemy.fireCooldown = 1.15 + Math.random() * 0.55;
        }
      } else if (enemy.type === 'knight') {
        enemy.vx = distance > 2.1 ? enemy.dir * enemy.speed : enemy.dir * enemy.speed * 0.25;
        if (enemy.leapCooldown <= 0 && distance < 7.5 && enemy.onGround) {
          enemy.vy = 7.5;
          enemy.onGround = false;
          enemy.leapCooldown = 2.2 + Math.random() * 1.4;
        }
        if (distance < 8 && enemy.fireCooldown <= 0) {
          fireEnemy(enemy);
          enemy.fireCooldown = 0.75 + Math.random() * 0.45;
        }
      } else if (enemy.type === 'rook') {
        enemy.vx = 0;
        if (distance < 12 && enemy.fireCooldown <= 0) {
          fireEnemy(enemy, false);
          enemy.fireCooldown = 1.35 + Math.random() * 0.5;
        }
      } else if (enemy.type === 'bishop') {
        enemy.vx = distance > 4.8 ? enemy.dir * enemy.speed : 0;
        if (distance < 11 && enemy.fireCooldown <= 0) {
          fireEnemy(enemy, false);
          enemy.fireCooldown = 0.42 + Math.random() * 0.16;
        }
        enemy.shellCooldown -= dt;
        if (distance < 12.5 && enemy.shellCooldown <= 0) {
          fireEnemy(enemy, true);
          enemy.shellCooldown = 2.05 + Math.random() * 0.55;
        }
      } else if (enemy.type === 'boss') {
        enemy.vx = 0;
        if (distance < 16 && enemy.fireCooldown <= 0) {
          fireEnemy(enemy, false);
          enemy.fireCooldown = 0.52 + Math.random() * 0.18;
        }
        enemy.shellCooldown -= dt;
        if (distance < 18 && enemy.shellCooldown <= 0) {
          fireEnemy(enemy, true);
          enemy.shellCooldown = 1.65 + Math.random() * 0.45;
        }
      }

      enemy.vy -= GRAVITY * dt;
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      if (enemy.y <= 0) {
        enemy.y = 0;
        enemy.vy = 0;
        enemy.onGround = true;
      }
      enemy.model.position.set(enemy.x, enemy.y, enemy.type === 'boss' ? -0.15 : enemy.type === 'bishop' ? 0.08 : 0);
      if (enemy.type === 'bishop') {
        enemy.model.userData.baseY = enemy.y;
        animateSturmBishopModel(enemy.model, state.time, { moving: Math.abs(enemy.vx) > 0.2, hurt: enemy.hurt > 0, dir: enemy.dir });
      } else {
        enemy.model.scale.x = Math.abs(enemy.model.scale.x || 1) * enemy.dir;
        animateSlugEnemy(enemy.model, enemy.type, state.time, { moving: Math.abs(enemy.vx) > 0.2, hurt: enemy.hurt > 0 });
      }

      const contact = enemy.type === 'boss' ? 3.5 : enemy.type === 'bishop' ? 1.15 : enemy.type === 'rook' ? 0.85 : 0.58;
      if (distance < contact && player.y < enemy.y + enemy.h) hurtPlayer(enemy.type === 'boss' ? 38 : enemy.type === 'bishop' ? 28 : 18);
    }

    for (const enemy of [...state.enemies]) {
      if (!enemy.dead) continue;
      dynamic.remove(enemy.model);
      disposePawnSlugObject(enemy.model);
      state.enemies.splice(state.enemies.indexOf(enemy), 1);
    }
  }

  function updateBullets(dt) {
    const playerBox = boxFor({ x: state.player.x, y: state.player.y, w: PLAYER_W, h: state.player.crouch ? 1.05 : PLAYER_H });
    for (const bullet of [...state.bullets]) {
      bullet.life -= dt;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.model.position.set(bullet.x, bullet.y, 0.3);
      animatePremiumProjectile(bullet.model, { time: state.time, explosive: bullet.explosive });
      let remove = bullet.life <= 0 || bullet.y < -1 || bullet.x < state.cameraX - VIEW_W || bullet.x > state.cameraX + VIEW_W * 1.8;

      if (!remove && bullet.enemy) {
        const bulletBox = { x: bullet.x - bullet.w / 2, y: bullet.y - bullet.h / 2, w: bullet.w, h: bullet.h };
        if (overlaps(bulletBox, playerBox)) {
          if (bullet.explosive) explode(bullet.x, bullet.y, 1.8, 0, true);
          else hurtPlayer(bullet.damage);
          remove = true;
        }
      } else if (!remove) {
        for (const enemy of state.enemies) {
          if (enemy.dead) continue;
          const bulletBox = { x: bullet.x - bullet.w / 2, y: bullet.y - bullet.h / 2, w: bullet.w, h: bullet.h };
          if (!overlaps(bulletBox, boxFor(enemy))) continue;
          if (bullet.explosive) explode(bullet.x, bullet.y, 1.9, bullet.damage);
          else damageEnemy(enemy, bullet.damage);
          remove = true;
          break;
        }
      }

      if (remove) {
        projectileLayer.remove(bullet.model);
        disposePawnSlugObject(bullet.model);
        state.bullets.splice(state.bullets.indexOf(bullet), 1);
      }
    }
  }

  function updateGrenades(dt) {
    for (const grenade of [...state.grenades]) {
      grenade.fuse -= dt;
      grenade.vy -= GRAVITY * 0.72 * dt;
      grenade.x += grenade.vx * dt;
      grenade.y += grenade.vy * dt;
      if (grenade.y <= 0.12) {
        grenade.y = 0.12;
        grenade.vy = Math.abs(grenade.vy) * 0.38;
        grenade.vx *= 0.72;
      }
      grenade.model.position.set(grenade.x, grenade.y, 0.4);
      grenade.model.rotation.z += dt * 8;
      if (grenade.fuse > 0) continue;
      explode(grenade.x, grenade.y + 0.2, 2.65, 125 * pawnSlugDamageMultiplier(state.player.level));
      projectileLayer.remove(grenade.model);
      disposePawnSlugObject(grenade.model);
      state.grenades.splice(state.grenades.indexOf(grenade), 1);
    }
  }

  function updatePickups(dt) {
    const playerBox = boxFor({ x: state.player.x, y: state.player.y, w: PLAYER_W, h: PLAYER_H });
    for (const pickup of [...state.pickups]) {
      pickup.model.position.y = pickup.y + 0.12 + Math.sin(state.time * 3.1 + pickup.bob) * 0.08;
      pickup.model.rotation.y += dt * 0.55;
      const pickupBox = { x: pickup.x - pickup.w / 2, y: pickup.y, w: pickup.w, h: pickup.h };
      if (!overlaps(playerBox, pickupBox)) continue;
      state.takenPickups.add(pickup.id);
      if (pickup.type === 'grenade') state.player.grenades += 3;
      else if (pickup.type === 'medkit') state.player.hp = Math.min(state.player.maxHp, state.player.hp + 45);
      else grantWeapon(pickup.type);
      state.score += 150;
      setToast(pawnSlugPickupCopy(pickup.type), 2.1);
      sfx.play('pickup');
      dynamic.remove(pickup.model);
      disposePawnSlugObject(pickup.model);
      state.pickups.splice(state.pickups.indexOf(pickup), 1);
      emitHud(true);
    }
  }

  function updateFx(dt) {
    for (const flash of [...state.flashes]) {
      flash.life -= dt;
      animatePremiumMuzzleFlash(flash.model, flash.life / flash.maxLife);
      if (flash.life > 0) continue;
      fxLayer.remove(flash.model);
      disposePawnSlugObject(flash.model);
      state.flashes.splice(state.flashes.indexOf(flash), 1);
    }
    for (const particle of [...state.particles]) {
      particle.life -= dt;
      particle.vy -= GRAVITY * 0.42 * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.model.position.x = particle.x;
      particle.model.position.y = particle.y;
      const alpha = clamp(particle.life / particle.maxLife, 0, 1);
      if (particle.model.material) particle.model.material.opacity = alpha;
      if (particle.life > 0) continue;
      fxLayer.remove(particle.model);
      disposePawnSlugObject(particle.model);
      state.particles.splice(state.particles.indexOf(particle), 1);
    }
  }

  function updateCamera(dt) {
    const bossAlive = state.enemies.some((enemy) => enemy.type === 'boss' && !enemy.dead);
    const desired = bossAlive && state.player.x > wx(PAWN_SLUG_WORLD.bossX - 570)
      ? wx(PAWN_SLUG_WORLD.bossX - 70)
      : Math.max(VIEW_W / 2, state.player.x + VIEW_W * 0.18);
    const maxCamera = wx(PAWN_SLUG_WORLD.extractionX) - VIEW_W / 2 + 1;
    const target = clamp(desired, VIEW_W / 2, maxCamera);
    state.cameraX += (target - state.cameraX) * (1 - Math.exp(-3.85 * dt));
    const shakeX = state.shake > 0 && !reducedMotion ? (Math.random() * 2 - 1) * state.shake : 0;
    const shakeY = state.shake > 0 && !reducedMotion ? (Math.random() * 2 - 1) * state.shake * 0.5 : 0;
    camera.position.x = state.cameraX + shakeX;
    camera.position.y = 5.1 + shakeY;
    camera.lookAt(state.cameraX + shakeX, 4.25 + shakeY * 0.5, 0);
    farEnvironment.position.x = state.cameraX * 0.58;
    state.shake = Math.max(0, state.shake - dt * 1.8);
  }

  function checkVictory() {
    if (!state.bossDefeated) return;
    if (state.player.x < wx(PAWN_SLUG_WORLD.extractionX - 50)) return;
    state.phase = 'victory';
    state.score += Math.max(0, 12000 - Math.floor(state.missionTime * 35));
    setAmbientDuck(false);
    setToast(pawnSlugMatthiasLine('win'), Infinity);
    burst(state.player.x + 1.5, 2.2, 1.3, true);
    emitHud(true);
  }

  function update(dt) {
    state.time += dt;
    if (state.phase !== 'playing') return;
    if (state.hitStop > 0) {
      state.hitStop = Math.max(0, state.hitStop - dt);
      updateFx(dt);
      return;
    }
    state.missionTime += dt;
    if (state.combo && state.time > state.comboUntil) state.combo = 0;
    spawnAhead();
    updatePlayer(dt);
    updateEnemies(dt);
    updateBullets(dt);
    updateGrenades(dt);
    updatePickups(dt);
    updateFx(dt);
    updateCamera(dt);
    checkVictory();
  }

  function render() {
    renderer.render(scene, camera);
  }

  function resize() {
    const width = Math.max(1, host.clientWidth || 1);
    const height = Math.max(1, host.clientHeight || 1);
    renderer.setSize(width, height, false);
    const aspect = width / height;
    const targetAspect = VIEW_W / VIEW_H;
    if (aspect >= targetAspect) {
      const extra = aspect / targetAspect;
      camera.left = -(VIEW_W * extra) / 2;
      camera.right = (VIEW_W * extra) / 2;
      camera.top = VIEW_H / 2;
      camera.bottom = -VIEW_H / 2;
    } else {
      const extra = targetAspect / aspect;
      camera.left = -VIEW_W / 2;
      camera.right = VIEW_W / 2;
      camera.top = (VIEW_H * extra) / 2;
      camera.bottom = -(VIEW_H * extra) / 2;
    }
    camera.updateProjectionMatrix();
  }

  function keyAction(event) {
    const key = event.key.toLowerCase();
    if (key === 'arrowleft' || key === 'a') return 'left';
    if (key === 'arrowright' || key === 'd') return 'right';
    if (key === 'arrowup' || key === 'w' || key === ' ') return 'jump';
    if (key === 'arrowdown' || key === 's') return 'crouch';
    if (key === 'z' || key === 'j' || key === 'enter') return 'fire';
    if (key === 'x' || key === 'k') return 'grenade';
    if (key === 'q') return 'weapon-prev';
    if (key === 'e') return 'weapon-next';
    const slot = Number.parseInt(key, 10);
    if (slot >= 1 && slot <= PAWN_SLUG_WEAPON_ORDER.length) return `weapon:${PAWN_SLUG_WEAPON_ORDER[slot - 1]}`;
    return null;
  }

  function setInput(action, pressed = true) {
    if (action === 'action') {
      if (pressed && ['ready', 'gameover', 'victory'].includes(state.phase)) startMission();
      return;
    }
    if (action === 'weapon-prev') {
      if (pressed) cycleWeapon(-1);
      return;
    }
    if (action === 'weapon-next') {
      if (pressed) cycleWeapon(1);
      return;
    }
    if (action.startsWith('weapon:')) {
      if (pressed) selectWeapon(action.slice('weapon:'.length));
      return;
    }
    if (action === 'fire') {
      const next = Boolean(pressed);
      if (next && !input.fire) input.firePressed = true;
      input.fire = next;
      return;
    }
    if (!(action in input)) return;
    input[action] = Boolean(pressed);
  }

  function onKeyDown(event) {
    const action = keyAction(event);
    if (!action) return;
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(event.key.toLowerCase())) event.preventDefault();
    if (event.repeat && action.startsWith('weapon')) return;
    if (['ready', 'gameover', 'victory'].includes(state.phase)) {
      if (action === 'fire' || action === 'jump') startMission();
      return;
    }
    setInput(action, true);
  }

  function onKeyUp(event) {
    const action = keyAction(event);
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
  placePlayer();
  emitHud(true);
  onReady?.(`THREE.JS · ${renderer.capabilities.isWebGL2 ? 'WEBGL2' : 'WEBGL1'}${coarse ? ' · MOBILE' : ''}`);

  function loop(now) {
    if (destroyed) return;
    frame = window.requestAnimationFrame(loop);
    const dt = clamp((now - previous) / 1000, 0, 0.04);
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
      sfx.destroy();
      resetDynamic();
      scene.remove(playerModel);
      disposePawnSlugObject(playerModel);
      disposePawnSlugObject(scene);
      renderer.dispose();
      renderer.forceContextLoss?.();
      if (host.contains(renderer.domElement)) host.removeChild(renderer.domElement);
    },
  };
}