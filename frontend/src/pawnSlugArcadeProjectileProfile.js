export const PAWN_SLUG_ARCADE_PROJECTILES = Object.freeze({
  pistol: Object.freeze({ shape: 'slug', length: 0.28, radius: 0.06, trail: 0.22, pellets: 1, spin: 0 }),
  machinegun: Object.freeze({ shape: 'needle', length: 0.4, radius: 0.04, trail: 0.34, pellets: 1, spin: 0 }),
  shotgun: Object.freeze({ shape: 'pellet', length: 0.12, radius: 0.05, trail: 0.1, pellets: 5, spread: 0.13, spin: 0 }),
  panzerfaust: Object.freeze({ shape: 'rocket', length: 0.64, radius: 0.09, trail: 0.54, pellets: 1, spin: 9 }),
  enemy: Object.freeze({ shape: 'needle', length: 0.46, radius: 0.052, trail: 0.44, pellets: 1, spin: 0 }),
  enemyPanzerfaust: Object.freeze({ shape: 'rocket', length: 0.72, radius: 0.105, trail: 0.68, pellets: 1, spin: 9 }),
});

export function pawnSlugArcadeProjectileProfile({ weapon = 'pistol', enemy = false, explosive = false } = {}) {
  if (explosive) return enemy ? PAWN_SLUG_ARCADE_PROJECTILES.enemyPanzerfaust : PAWN_SLUG_ARCADE_PROJECTILES.panzerfaust;
  if (enemy) return PAWN_SLUG_ARCADE_PROJECTILES.enemy;
  return PAWN_SLUG_ARCADE_PROJECTILES[weapon] || PAWN_SLUG_ARCADE_PROJECTILES.pistol;
}
