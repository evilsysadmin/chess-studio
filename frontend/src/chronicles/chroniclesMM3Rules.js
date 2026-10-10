// Chronicles character rules, Might and Magic III style.
//
// Seven stats rolled 3-18 (3d6) with unlimited rerolls at creation, the ten
// MM3 classes with their stat minimums and HP per level, and the classic MM3
// stat-bonus table. Races are not modelled yet.
// Every number the character sheet shows here is wired into the first-person
// rules: Endurance → HP, Might → damage, Accuracy → to-hit, Speed → AC and
// initiative, Luck → trap saves. Intellect/Personality are rolled and gate
// classes now; spell points arrive with spells (see the economy contract).

export const CHRONICLES_MM3_STATS = Object.freeze([
  'might', 'intellect', 'personality', 'endurance', 'speed', 'accuracy', 'luck',
]);

export const CHRONICLES_MM3_STAT_LABELS = Object.freeze({
  might: 'Fuerza',
  intellect: 'Intelecto',
  personality: 'Personalidad',
  endurance: 'Resistencia',
  speed: 'Velocidad',
  accuracy: 'Precisión',
  luck: 'Suerte',
});

export const CHRONICLES_MM3_STAT_SHORT = Object.freeze({
  might: 'FUE', intellect: 'INT', personality: 'PER', endurance: 'RES', speed: 'VEL', accuracy: 'PRE', luck: 'SUE',
});

export const CHRONICLES_MM3_STAT_EFFECTS = Object.freeze({
  might: 'Daño cuerpo a cuerpo',
  intellect: 'Requisito de clases arcanas',
  personality: 'Requisito de clases clericales',
  endurance: 'Puntos de vida',
  speed: 'Clase de armadura e iniciativa',
  accuracy: 'Probabilidad de acertar',
  luck: 'Salvación contra trampas',
});

export const CHRONICLES_MM3_STAT_MIN = 3;
export const CHRONICLES_MM3_STAT_MAX = 18;

// MM3 series bonus table (the same bands MM4/5 keep).
const BONUS_BANDS = Object.freeze([
  [2, -5], [4, -4], [6, -3], [8, -2], [10, -1], [12, 0],
  [14, 1], [16, 2], [18, 3], [20, 4], [23, 5], [26, 6],
]);

export function chroniclesMM3StatBonus(value) {
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric)) return 0;
  const band = BONUS_BANDS.find(([upper]) => numeric <= upper);
  return band ? band[1] : 7;
}

// Armor tiers: 0 none, 1 padded, 2 leather, 3 scale, 4 ring, 5 chain,
// 6 splint, 7 plate. Weapon families gate what each class may wield.
export const CHRONICLES_MM3_ARMOR_TIERS = Object.freeze({
  none: 0, padded: 1, leather: 2, scale: 3, ring: 4, chain: 5, splint: 6, plate: 7,
});

const ALL_WEAPONS = Object.freeze(['sword', 'axe', 'mace', 'staff', 'dagger', 'spear', 'bow', 'crossbow', 'sling']);

function cls(spec) {
  return Object.freeze({
    ...spec,
    requirements: Object.freeze({ ...spec.requirements }),
    weapons: Object.freeze([...spec.weapons]),
  });
}

// MM3 class table: HP per level, minimums, armor ceiling, shields, weapons
// and spell school (https://shrines.rpgclassics.com/pc/mm3/character.shtml).
export const CHRONICLES_MM3_CLASSES = Object.freeze({
  knight: cls({
    id: 'knight', label: 'Caballero', hpBase: 10, requirements: { might: 15 },
    maxArmorTier: 7, shield: true, weapons: ALL_WEAPONS, spellStat: null,
    summary: 'Maestro de armas: cualquier arma y armadura, sin magia.',
  }),
  paladin: cls({
    id: 'paladin', label: 'Paladín', hpBase: 8, requirements: { might: 13, personality: 13, endurance: 13 },
    maxArmorTier: 7, shield: true, weapons: ALL_WEAPONS, spellStat: 'personality',
    summary: 'Cruzado: armas y armaduras completas, media magia clerical.',
  }),
  archer: cls({
    id: 'archer', label: 'Arquero', hpBase: 7, requirements: { intellect: 13, accuracy: 13 },
    maxArmorTier: 5, shield: false, weapons: ALL_WEAPONS, spellStat: 'intellect',
    summary: 'Tirador: hasta cota de malla, sin escudo, media magia arcana.',
  }),
  cleric: cls({
    id: 'cleric', label: 'Clérigo', hpBase: 5, requirements: { personality: 13 },
    maxArmorTier: 6, shield: true, weapons: ['mace', 'staff'], spellStat: 'personality',
    summary: 'Magia clerical completa; sin armas de filo ni a distancia.',
  }),
  sorcerer: cls({
    id: 'sorcerer', label: 'Hechicero', hpBase: 4, requirements: { intellect: 13 },
    maxArmorTier: 1, shield: false, weapons: ['staff', 'dagger'], spellStat: 'intellect',
    summary: 'Magia arcana completa; frágil, sólo bastón, daga y acolchado.',
  }),
  robber: cls({
    id: 'robber', label: 'Ladrón', hpBase: 8, requirements: { luck: 13 },
    maxArmorTier: 5, shield: true, weapons: ['sword', 'dagger', 'mace', 'axe', 'crossbow', 'sling'], spellStat: null,
    summary: 'Ladronería: cerraduras y trampas; hasta cota de malla.',
  }),
  ninja: cls({
    id: 'ninja', label: 'Ninja', hpBase: 7, requirements: { speed: 13, accuracy: 13 },
    maxArmorTier: 4, shield: false, weapons: ['sword', 'dagger', 'staff', 'spear'], spellStat: null,
    summary: 'Rápido y certero: hasta cota de anillas, sin escudo.',
  }),
  barbarian: cls({
    id: 'barbarian', label: 'Bárbaro', hpBase: 12, requirements: { endurance: 15 },
    maxArmorTier: 3, shield: true, weapons: ['axe', 'mace', 'spear', 'staff', 'dagger', 'sling'], spellStat: null,
    summary: 'La mayor vida: hasta escamas y escudo, nada de magia.',
  }),
  druid: cls({
    id: 'druid', label: 'Druida', hpBase: 6, requirements: { intellect: 15, personality: 15 },
    maxArmorTier: 2, shield: false, weapons: ['staff', 'dagger', 'mace', 'sling'], spellStat: 'personality',
    summary: 'Magia natural completa; armas y armaduras ligeras.',
  }),
  ranger: cls({
    id: 'ranger', label: 'Explorador', hpBase: 9, requirements: { intellect: 12, personality: 12, endurance: 12, speed: 12 },
    maxArmorTier: 5, shield: true, weapons: ALL_WEAPONS, spellStat: 'personality',
    summary: 'Guerrero de los caminos con media magia natural.',
  }),
});

export const CHRONICLES_MM3_CLASS_IDS = Object.freeze(Object.keys(CHRONICLES_MM3_CLASSES));

export function chroniclesMM3Class(classId) {
  return CHRONICLES_MM3_CLASSES[classId] || null;
}

function clampStat(value) {
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric)) return null;
  return Math.max(CHRONICLES_MM3_STAT_MIN, Math.min(CHRONICLES_MM3_STAT_MAX, numeric));
}

export function normalizeChroniclesMM3Stats(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const stats = {};
  for (const key of CHRONICLES_MM3_STATS) {
    const value = clampStat(source[key]);
    if (value == null) return null;
    stats[key] = value;
  }
  return stats;
}

export function chroniclesMM3UnmetRequirements(classId, stats) {
  const definition = chroniclesMM3Class(classId);
  if (!definition) return [{ stat: null, need: 0, have: 0 }];
  return Object.entries(definition.requirements)
    .filter(([stat, need]) => Number(stats?.[stat] || 0) < need)
    .map(([stat, need]) => ({ stat, need, have: Number(stats?.[stat] || 0) }));
}

export function chroniclesMM3ClassAllowed(classId, stats) {
  return chroniclesMM3UnmetRequirements(classId, stats).length === 0;
}

export function chroniclesMM3RollStats(random = Math.random) {
  const d6 = () => 1 + Math.floor(Math.min(0.999999, Math.max(0, Number(random()) || 0)) * 6);
  return Object.fromEntries(CHRONICLES_MM3_STATS.map((key) => [key, d6() + d6() + d6()]));
}

// Level-1 derived sheet. HP, AC and to-hit are the numbers combat uses.
export function chroniclesMM3Derived(classId, stats, { level = 1, armorClassBonus = 0, toHitBonus = 0 } = {}) {
  const definition = chroniclesMM3Class(classId) || CHRONICLES_MM3_CLASSES.knight;
  const bonuses = Object.fromEntries(CHRONICLES_MM3_STATS.map((key) => [key, chroniclesMM3StatBonus(stats?.[key])]));
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  return {
    classId: definition.id,
    classLabel: definition.label,
    bonuses,
    maxHp: Math.max(1, definition.hpBase + bonuses.endurance),
    armorClass: Math.max(0, bonuses.speed + Number(armorClassBonus || 0)),
    toHit: safeLevel + bonuses.accuracy + Number(toHitBonus || 0),
    damageBonus: bonuses.might,
    initiativeBonus: bonuses.speed,
    trapSave: bonuses.luck,
  };
}

// Deterministic d20 for a given combat moment: the same state always rolls
// the same, so F5/replays/CAS retries cannot reroll an attack.
function hashText(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function chroniclesMM3Roll(state, ...parts) {
  const key = [state?.runSeed ?? '', state?.mapId ?? '', state?.turns ?? 0, ...parts].join('|');
  let value = hashText(key);
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return 1 + (((value ^ (value >>> 14)) >>> 0) % 20);
}

// Natural 20 always hits, natural 1 always misses, otherwise
// d20 + attack bonus must reach 10 + the defender's armor class.
export function chroniclesMM3AttackHits(roll, toHit, armorClass) {
  if (roll >= 20) return true;
  if (roll <= 1) return false;
  return roll + Number(toHit || 0) >= 10 + Number(armorClass || 0);
}

export function chroniclesMM3EnemyArmorClass(enemy) {
  if (Number.isFinite(Number(enemy?.armorClass))) return Number(enemy.armorClass);
  const build = enemy?.enemyBuild || {};
  const level = Math.max(1, Number(build.level || 1));
  const agility = Number(build.attributes?.agility ?? enemy?.agility ?? 0);
  return level + Math.floor(Math.max(0, agility) / 2);
}

export function chroniclesMM3EnemyToHit(enemy) {
  if (Number.isFinite(Number(enemy?.toHit))) return Number(enemy.toHit);
  const build = enemy?.enemyBuild || {};
  return Math.max(1, Number(build.level || 1)) + Math.max(0, Number(build.attributes?.precision || 0));
}
