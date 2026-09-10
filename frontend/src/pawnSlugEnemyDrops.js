import { pawnSlugEnemyWeaponFor } from './pawnSlugEnemyLoadouts.js';

const DROP_CHANCE_BY_TYPE = Object.freeze({ pawn: 0.1, knight: 0.16, rook: 0.22, bishop: 0.45, boss: 1 });
const AMMO_BY_WEAPON = Object.freeze({ pistol: 0, machinegun: 36, shotgun: 10, panzerfaust: 2 });

function stableRoll(seed = '') {
  let hash = 2166136261;
  for (const char of String(seed)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

export function pawnSlugEnemyDropFor({ type = 'pawn', id = '', weapon, variant = 0 } = {}) {
  const carriedWeapon = weapon || pawnSlugEnemyWeaponFor(type, variant);
  if (carriedWeapon === 'pistol') return null;
  const chance = DROP_CHANCE_BY_TYPE[type] ?? DROP_CHANCE_BY_TYPE.pawn;
  if (stableRoll(`${id}:${type}:${carriedWeapon}`) >= chance) return null;
  return Object.freeze({
    kind: 'weapon-ammo',
    weapon: carriedWeapon,
    ammo: AMMO_BY_WEAPON[carriedWeapon] || 0,
    sourceType: type,
  });
}

export function pawnSlugBossDropFor({ weapon = 'panzerfaust' } = {}) {
  return Object.freeze({ kind: 'weapon-ammo', weapon, ammo: AMMO_BY_WEAPON[weapon] || 1, sourceType: 'boss' });
}

export const PAWN_SLUG_ENEMY_DROP_META = Object.freeze({
  rule: 'drop-only-what-enemy-carries',
  dropChanceByType: DROP_CHANCE_BY_TYPE,
  ammoByWeapon: AMMO_BY_WEAPON,
});
