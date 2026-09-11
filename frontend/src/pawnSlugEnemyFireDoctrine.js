const freeze = (value) => Object.freeze(value);

export const PAWN_SLUG_ENEMY_FIRE_PROFILES = freeze({
  pistol: freeze({ range: 9, cooldownMin: 1.05, cooldownMax: 1.55, speed: 7.2, damage: 13, pellets: 1, spread: 0, telegraph: 0.08 }),
  machinegun: freeze({ range: 10.5, cooldownMin: 0.62, cooldownMax: 0.95, speed: 8.4, damage: 9, pellets: 1, spread: 0.035, burstMin: 2, burstMax: 4, telegraph: 0.1 }),
  shotgun: freeze({ range: 6.8, cooldownMin: 1.25, cooldownMax: 1.7, speed: 6.8, damage: 6, pellets: 5, spread: 0.16, telegraph: 0.22 }),
  panzerfaust: freeze({ range: 15, cooldownMin: 1.8, cooldownMax: 2.45, speed: 5.6, damage: 30, pellets: 1, spread: 0, explosive: true, telegraph: 0.34 }),
});

export const PAWN_SLUG_ENEMY_ROLE_PRESSURE = freeze({
  pawn: freeze({ preferredDistance: 4.6, aggression: 0.72, flank: 0.08, leap: false }),
  knight: freeze({ preferredDistance: 2.4, aggression: 0.92, flank: 0.78, leap: true }),
  rook: freeze({ preferredDistance: 9.2, aggression: 0.58, flank: 0, leap: false }),
  bishop: freeze({ preferredDistance: 8.4, aggression: 0.68, flank: 0.18, leap: false }),
  boss: freeze({ preferredDistance: 11, aggression: 0.8, flank: 0, leap: false }),
});

export function pawnSlugEnemyFireProfile(weapon = 'pistol') {
  return PAWN_SLUG_ENEMY_FIRE_PROFILES[weapon] || PAWN_SLUG_ENEMY_FIRE_PROFILES.pistol;
}

export function pawnSlugEnemyFireCooldown(weapon = 'pistol', unit = 0.5) {
  const profile = pawnSlugEnemyFireProfile(weapon);
  const t = Math.max(0, Math.min(1, Number(unit) || 0));
  return profile.cooldownMin + (profile.cooldownMax - profile.cooldownMin) * t;
}

export function pawnSlugEnemyTelegraphStrength(weapon = 'pistol', cooldown = Infinity) {
  const window = pawnSlugEnemyFireProfile(weapon).telegraph || 0;
  const remaining = Number(cooldown);
  if (!(window > 0) || !Number.isFinite(remaining) || remaining <= 0 || remaining > window) return 0;
  return Math.max(0, Math.min(1, 1 - (remaining / window)));
}

export function pawnSlugEnemyShotPlan(weapon = 'pistol') {
  const profile = pawnSlugEnemyFireProfile(weapon);
  return freeze({
    weapon,
    speed: profile.speed,
    damage: profile.damage,
    pellets: profile.pellets,
    spread: profile.spread,
    explosive: Boolean(profile.explosive),
    telegraph: profile.telegraph || 0,
  });
}
