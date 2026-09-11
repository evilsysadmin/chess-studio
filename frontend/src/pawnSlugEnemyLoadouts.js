export const PAWN_SLUG_ENEMY_LOADOUTS = Object.freeze({
  pawn: Object.freeze({ primary: 'pistol', alternates: Object.freeze(['machinegun']), role: 'pressure-infantry' }),
  knight: Object.freeze({ primary: 'machinegun', alternates: Object.freeze(['shotgun']), role: 'mobile-flanker' }),
  rook: Object.freeze({ primary: 'machinegun', primaryWeight: 2, alternates: Object.freeze(['panzerfaust']), role: 'lane-controller' }),
  bishop: Object.freeze({ primary: 'machinegun', alternates: Object.freeze(['panzerfaust']), role: 'suppression-artillery' }),
  boss: Object.freeze({ primary: 'machinegun', alternates: Object.freeze(['panzerfaust']), role: 'heavy-combined-arms' }),
});

export function pawnSlugEnemyWeaponFor(type = 'pawn', variant = 0) {
  const loadout = PAWN_SLUG_ENEMY_LOADOUTS[type] || PAWN_SLUG_ENEMY_LOADOUTS.pawn;
  const primaryWeight = Math.max(1, Math.floor(Number(loadout.primaryWeight) || 1));
  const choices = [...Array(primaryWeight).fill(loadout.primary), ...loadout.alternates];
  const index = Math.abs(Math.floor(Number(variant) || 0)) % choices.length;
  return choices[index];
}

export function pawnSlugEnemyLoadoutFor(type = 'pawn') {
  return PAWN_SLUG_ENEMY_LOADOUTS[type] || PAWN_SLUG_ENEMY_LOADOUTS.pawn;
}
