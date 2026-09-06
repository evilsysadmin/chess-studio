export const PAWN_SLUG_WORLD = Object.freeze({
  width: 5200,
  groundY: 420,
  bossX: 4580,
  extractionX: 5050,
});

export const PAWN_SLUG_PLAYER = Object.freeze({
  baseMaxHp: 100,
  hpPerLevel: 8,
  damagePerLevel: 0.05,
  maxLevel: 12,
});

export const PAWN_SLUG_WEAPON_ORDER = Object.freeze(['pistol', 'machinegun', 'shotgun', 'panzerfaust']);

export const PAWN_SLUG_WEAPONS = Object.freeze({
  pistol: Object.freeze({ id: 'pistol', slot: 1, shortLabel: 'PST', label: 'Dienstpistole', trigger: 'semi', ammo: Infinity, cadence: 210, damage: 22, speed: 760, pellets: 1, spread: 0 }),
  machinegun: Object.freeze({ id: 'machinegun', slot: 2, shortLabel: 'MG', label: 'MG-42 de bolsillo', trigger: 'auto', ammo: 180, cadence: 82, damage: 13, speed: 860, pellets: 1, spread: 0.025 }),
  shotgun: Object.freeze({ id: 'shotgun', slot: 3, shortLabel: 'SG', label: 'Escopeta diplomática', trigger: 'semi', ammo: 42, cadence: 430, damage: 13, speed: 690, pellets: 6, spread: 0.19 }),
  panzerfaust: Object.freeze({ id: 'panzerfaust', slot: 4, shortLabel: 'PZF', label: 'Panzerfaust', trigger: 'semi', ammo: 9, cadence: 720, damage: 92, speed: 520, pellets: 1, spread: 0, explosive: true }),
});

export const PAWN_SLUG_PICKUPS = Object.freeze([
  Object.freeze({ x: 920, type: 'machinegun' }),
  Object.freeze({ x: 1810, type: 'grenade' }),
  Object.freeze({ x: 2470, type: 'shotgun' }),
  Object.freeze({ x: 3300, type: 'medkit' }),
  Object.freeze({ x: 3830, type: 'panzerfaust' }),
  Object.freeze({ x: 4310, type: 'grenade' }),
]);

export const PAWN_SLUG_SPAWNS = Object.freeze([
  [620, 'pawn'], [790, 'pawn'], [1080, 'pawn'], [1210, 'knight'], [1380, 'pawn'],
  [1560, 'rook'], [1710, 'pawn'], [1940, 'knight'], [2110, 'pawn'], [2250, 'pawn'],
  [2590, 'rook'], [2730, 'pawn'], [2890, 'knight'], [3070, 'pawn'], [3210, 'pawn'],
  [3430, 'rook'], [3560, 'knight'], [3700, 'pawn'], [3950, 'pawn'], [4070, 'knight'],
  [4190, 'rook'], [4380, 'pawn'],
].map(([x, type], index) => Object.freeze({ id: `${type}-${index}`, x, type })));

export const PAWN_SLUG_ENEMIES = Object.freeze({
  pawn: Object.freeze({ hp: 34, speed: 54, score: 100, xp: 28, width: 38, height: 62 }),
  knight: Object.freeze({ hp: 62, speed: 92, score: 220, xp: 52, width: 48, height: 68 }),
  rook: Object.freeze({ hp: 112, speed: 0, score: 350, xp: 78, width: 58, height: 76 }),
  boss: Object.freeze({ hp: 780, speed: 0, score: 3500, xp: 650, width: 190, height: 150 }),
});

export function pawnSlugClamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function pawnSlugWeaponLabel(id) {
  return PAWN_SLUG_WEAPONS[id]?.label || PAWN_SLUG_WEAPONS.pistol.label;
}

export function pawnSlugWeaponShortLabel(id) {
  return PAWN_SLUG_WEAPONS[id]?.shortLabel || PAWN_SLUG_WEAPONS.pistol.shortLabel;
}

export function pawnSlugAmmoForPickup(type) {
  if (type === 'grenade') return 3;
  return PAWN_SLUG_WEAPONS[type]?.ammo ?? 0;
}

export function pawnSlugScoreForKill(type) {
  return PAWN_SLUG_ENEMIES[type]?.score || 0;
}

export function pawnSlugXpForKill(type) {
  return PAWN_SLUG_ENEMIES[type]?.xp || 0;
}

export function pawnSlugXpForLevel(level) {
  const target = pawnSlugClamp(Math.floor(Number(level) || 1), 1, PAWN_SLUG_PLAYER.maxLevel);
  const completed = target - 1;
  return completed * 120 + ((completed * (completed - 1)) / 2) * 70;
}

export function pawnSlugLevelForXp(xp) {
  const safeXp = Math.max(0, Math.floor(Number(xp) || 0));
  let level = 1;
  while (level < PAWN_SLUG_PLAYER.maxLevel && safeXp >= pawnSlugXpForLevel(level + 1)) level += 1;
  return level;
}

export function pawnSlugLevelProgress(xp, level = pawnSlugLevelForXp(xp)) {
  const safeLevel = pawnSlugClamp(Math.floor(Number(level) || 1), 1, PAWN_SLUG_PLAYER.maxLevel);
  if (safeLevel >= PAWN_SLUG_PLAYER.maxLevel) return 1;
  const start = pawnSlugXpForLevel(safeLevel);
  const end = pawnSlugXpForLevel(safeLevel + 1);
  return pawnSlugClamp((Math.max(0, Number(xp) || 0) - start) / Math.max(1, end - start), 0, 1);
}

export function pawnSlugMaxHpForLevel(level) {
  const safeLevel = pawnSlugClamp(Math.floor(Number(level) || 1), 1, PAWN_SLUG_PLAYER.maxLevel);
  return PAWN_SLUG_PLAYER.baseMaxHp + (safeLevel - 1) * PAWN_SLUG_PLAYER.hpPerLevel;
}

export function pawnSlugDamageMultiplier(level) {
  const safeLevel = pawnSlugClamp(Math.floor(Number(level) || 1), 1, PAWN_SLUG_PLAYER.maxLevel);
  return 1 + (safeLevel - 1) * PAWN_SLUG_PLAYER.damagePerLevel;
}

export function pawnSlugSpawnWindow(cameraX, spawnedIds = new Set(), lookAhead = 1120) {
  const right = cameraX + lookAhead;
  return PAWN_SLUG_SPAWNS.filter((spawn) => spawn.x <= right && spawn.x >= cameraX - 180 && !spawnedIds.has(spawn.id));
}

export function pawnSlugBossUnlocked(playerX) {
  return playerX >= PAWN_SLUG_WORLD.bossX - 720;
}

export function pawnSlugProgress(playerX) {
  return pawnSlugClamp(playerX / PAWN_SLUG_WORLD.extractionX, 0, 1);
}

export function pawnSlugPickupCopy(type) {
  if (type === 'grenade') return 'GRANADAS +3. Diplomacia de fragmentación.';
  if (type === 'medkit') return 'CAFÉ DE CAMPAÑA. Inexplicablemente medicinal.';
  if (type === 'machinegun') return 'HEAVY MACHINE GUN. Sehr gut.';
  if (type === 'shotgun') return 'SHOTGUN. Negociación a corta distancia.';
  if (type === 'panzerfaust') return 'PANZERFAUST. La sutileza ha muerto.';
  return 'Munición requisada.';
}

export function pawnSlugMatthiasLine(event) {
  const lines = {
    start: 'Vorwärts. Si algo se mueve, probablemente ha tomado una mala decisión.',
    hurt: 'Ach. Eso era parte de mi cuerpo, animal.',
    grenade: 'Granada enviada. Sin acuse de recibo.',
    levelUp: 'Ascenso concedido. Mis condolencias al enemigo.',
    boss: 'Ah. Un castillo con orugas. Qué imaginación tan ofensiva.',
    bossDown: 'Schachmatt, mamotreto.',
    win: 'Sector limpio. El Convenio de Ginebra solicita una reunión.',
    death: 'Informe táctico: eso ha salido como el culo.',
  };
  return lines[event] || '';
}
