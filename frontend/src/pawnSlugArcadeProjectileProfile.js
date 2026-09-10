export const PAWN_SLUG_ARCADE_PROJECTILES = Object.freeze({
  pistol: Object.freeze({ shape: 'slug', length: 0.26, radius: 0.055, trail: 0.22, pellets: 1, spin: 0 }),
  machinegun: Object.freeze({ shape: 'needle', length: 0.38, radius: 0.038, trail: 0.34, pellets: 1, spin: 0 }),
  shotgun: Object.freeze({ shape: 'pellet', length: 0.12, radius: 0.048, trail: 0.1, pellets: 5, spread: 0.13, spin: 0 }),
  panzerfaust: Object.freeze({ shape: 'rocket', length: 0.62, radius: 0.09, trail: 0.52, pellets: 1, spin: 9 }),
  enemy: Object.freeze({ shape: 'slug', length: 0.3, radius: 0.052, trail: 0.25, pellets: 1, spin: 0 }),
});

export function pawnSlugArcadeProjectileProfile({ enemy = false, weapon = 'pistol', explosive = false } = {}) {
  if (explosive) return PAWN_SLUG_ARCADE_PROJECTILES.panzerfaust;
  if (enemy) return PAWN_SLUG_ARCADE_PROJECTILES.enemy;
  return PAWN_SLUG_ARCADE_PROJECTILES[weapon] || PAWN_SLUG_ARCADE_PROJECTILES.pistol;
}
