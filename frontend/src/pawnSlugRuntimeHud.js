import {
  PAWN_SLUG_PLAYER,
  PAWN_SLUG_WEAPON_ORDER,
  PAWN_SLUG_WEAPONS,
  PAWN_SLUG_WORLD,
  pawnSlugLevelProgress,
  pawnSlugWeaponShortLabel,
  pawnSlugXpForLevel,
} from './pawnSlug.js';
import { pawnSlugLiveWeaponLabel, pawnSlugLiveWeaponModel } from './pawnSlugLiveWeaponModels.js';
import { PAWN_SLUG_STURM_BISHOP_META } from './pawnSlugMidBoss.js';
import { pawnSlugClamp, pawnSlugWorldX } from './pawnSlugRuntimeCore.js';

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
