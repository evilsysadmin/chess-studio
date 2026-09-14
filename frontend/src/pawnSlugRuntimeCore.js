import {
  PAWN_SLUG_PLAYER,
  PAWN_SLUG_WEAPON_ORDER,
  PAWN_SLUG_WEAPONS,
  PAWN_SLUG_WORLD,
  pawnSlugLevelProgress,
  pawnSlugLiveWeaponLabel,
  pawnSlugMaxHpForLevel,
  pawnSlugWeaponShortLabel,
  pawnSlugXpForLevel,
} from './pawnSlug.js';
import { pawnSlugLiveWeaponModel } from './pawnSlugLiveWeaponModels.js';
import { PAWN_SLUG_STURM_BISHOP_META } from './pawnSlugMidBoss.js';

export const PAWN_SLUG_WORLD_SCALE = 1 / 40;
export const PAWN_SLUG_VIEW_W = 29.5;
export const PAWN_SLUG_VIEW_H = 16.6;
export const PAWN_SLUG_GROUND_Y = 0;
export const PAWN_SLUG_PLAYER_SPEED = 5.1;
export const PAWN_SLUG_PLAYER_JUMP = 8.4;
export const PAWN_SLUG_GRAVITY = 22;
export const PAWN_SLUG_PLAYER_W = 0.82;
export const PAWN_SLUG_PLAYER_H = 1.75;
export const PAWN_SLUG_CHECKPOINTS = Object.freeze([110, 1480, 2980, 4140].map((value) => value * PAWN_SLUG_WORLD_SCALE));
export const PAWN_SLUG_WEAPON_VISUAL_FRAME = Object.freeze({ pistol: 0, machinegun: 1, shotgun: 2, panzerfaust: 3 });

export function pawnSlugWorldX(value) {
  return value * PAWN_SLUG_WORLD_SCALE;
}

export function pawnSlugClamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function pawnSlugStableEnemyVariant(id = '') {
  let hash = 0;
  for (const char of String(id)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}

export function createPawnSlugInitialArsenal() {
  return Object.fromEntries(PAWN_SLUG_WEAPON_ORDER.map((id) => [
    id,
    {
      unlocked: id === 'pistol',
      ammo: id === 'pistol' ? Infinity : 0,
    },
  ]));
}

export function createPawnSlugInitialState({ startToast = '' } = {}) {
  const maxHp = pawnSlugMaxHpForLevel(1);
  return {
    phase: 'ready',
    time: 0,
    missionTime: 0,
    score: 0,
    credits: 0,
    combo: 0,
    comboUntil: 0,
    cameraX: 0,
    shake: 0,
    hitStop: 0,
    toast: startToast,
    toastUntil: Infinity,
    spawned: new Set(),
    takenPickups: new Set(),
    pows: [],
    rescuedPows: new Set(),
    destructibles: [],
    destroyedDestructibles: new Set(),
    enemies: [],
    pickups: [],
    bullets: [],
    grenades: [],
    particles: [],
    flashes: [],
    bossSpawned: false,
    bossDefeated: false,
    checkpoint: PAWN_SLUG_CHECKPOINTS[0],
    player: {
      x: PAWN_SLUG_CHECKPOINTS[0],
      y: PAWN_SLUG_GROUND_Y,
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
      arsenal: createPawnSlugInitialArsenal(),
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

export function createPawnSlugInputState() {
  return {
    left: false,
    right: false,
    jump: false,
    fire: false,
    firePressed: false,
    grenade: false,
    crouch: false,
  };
}

export function resetPawnSlugInput(input) {
  for (const key of Object.keys(input)) input[key] = false;
}

export function pawnSlugNearestCheckpoint(x) {
  let result = PAWN_SLUG_CHECKPOINTS[0];
  for (const checkpoint of PAWN_SLUG_CHECKPOINTS) if (checkpoint <= x) result = checkpoint;
  return result;
}

export function pawnSlugKeyAction(event) {
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

function arsenalHud(player) {
  return PAWN_SLUG_WEAPON_ORDER.map((id) => {
    const weapon = PAWN_SLUG_WEAPONS[id];
    const model = pawnSlugLiveWeaponModel(id);
    const slot = player.arsenal[id];
    return {
      id,
      slot: weapon.slot,
      shortLabel: pawnSlugWeaponShortLabel(id),
      label: pawnSlugLiveWeaponLabel(id),
      modelId: model?.id || null,
      current: player.weapon === id,
      unlocked: Boolean(slot?.unlocked),
      ammo: id === 'pistol' ? null : Math.max(0, Math.ceil(slot?.ammo || 0)),
    };
  });
}

export function pawnSlugRuntimeHud(state) {
  const boss = state.enemies.find((enemy) => enemy.type === 'boss' && !enemy.dead);
  const midBoss = state.enemies.find((enemy) => enemy.type === 'bishop' && !enemy.dead);
  const player = state.player;
  const nextLevelXp = player.level >= PAWN_SLUG_PLAYER.maxLevel ? null : pawnSlugXpForLevel(player.level + 1);
  const liveModel = pawnSlugLiveWeaponModel(player.weapon);
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
    weaponModelId: liveModel?.id || null,
    weaponLabel: pawnSlugLiveWeaponLabel(player.weapon),
    ammo: Number.isFinite(player.ammo) ? Math.max(0, Math.ceil(player.ammo)) : null,
    weapons: arsenalHud(player),
    grenades: player.grenades,
    credits: Math.max(0, Math.floor(state.credits || 0)),
    score: Math.floor(state.score),
    combo: state.combo,
    progress: pawnSlugClamp(player.x / pawnSlugWorldX(PAWN_SLUG_WORLD.extractionX), 0, 1),
    midBossHp: midBoss ? Math.max(0, Math.ceil(midBoss.hp)) : null,
    midBossMaxHp: midBoss?.maxHp || null,
    midBossLabel: midBoss ? PAWN_SLUG_STURM_BISHOP_META.label : null,
    bossHp: boss ? Math.max(0, Math.ceil(boss.hp)) : null,
    bossMaxHp: boss?.maxHp || null,
    toast: state.time <= state.toastUntil || ['ready', 'gameover', 'victory'].includes(state.phase) ? state.toast : '',
    missionTime: Math.floor(state.missionTime),
  };
}
