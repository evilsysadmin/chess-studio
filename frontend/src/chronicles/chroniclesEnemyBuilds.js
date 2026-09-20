export const CHRONICLES_ENEMY_BUILD_VERSION = 1;
export const CHRONICLES_ENEMY_LEVEL_CAP = 20;
export const CHRONICLES_ENEMY_ATTRIBUTE_CAP = 5;
export const CHRONICLES_ENEMY_ATTRIBUTE_KEYS = Object.freeze([
  'vigor',
  'power',
  'precision',
  'will',
]);

export const CHRONICLES_ENEMY_SKILLS = Object.freeze({
  'brutal-strike': Object.freeze({
    id: 'brutal-strike',
    label: 'Golpe brutal',
    description: '+1 daño de ataque.',
    modifiers: Object.freeze({ damageBonus: 1 }),
  }),
  'hunter-instinct': Object.freeze({
    id: 'hunter-instinct',
    label: 'Instinto cazador',
    description: '+1 radio de persecución al entrar en combate.',
    modifiers: Object.freeze({ engageRangeBonus: 1 }),
  }),
  'spectral-geometry': Object.freeze({
    id: 'spectral-geometry',
    label: 'Geometría espectral',
    description: '+1 alcance de ataque.',
    modifiers: Object.freeze({ reachBonus: 1 }),
  }),
  'thick-hide': Object.freeze({
    id: 'thick-hide',
    label: 'Coraza',
    description: '+2 vida máxima.',
    modifiers: Object.freeze({ bonusMaxHp: 2 }),
  }),
});

function nonNegativeInteger(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.floor(number));
}

function normalizeAttributes(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return Object.fromEntries(CHRONICLES_ENEMY_ATTRIBUTE_KEYS.map((key) => [
    key,
    Math.min(CHRONICLES_ENEMY_ATTRIBUTE_CAP, nonNegativeInteger(source[key])),
  ]));
}

function normalizeSkills(raw) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(
    raw
      .filter((id) => typeof id === 'string' && CHRONICLES_ENEMY_SKILLS[id])
      .map((id) => id.trim()),
  )].slice(0, 8);
}

export function createDefaultChroniclesEnemyBuild(archetype = 'enemy') {
  return {
    version: CHRONICLES_ENEMY_BUILD_VERSION,
    archetype: String(archetype || 'enemy').trim() || 'enemy',
    level: 1,
    attributes: normalizeAttributes(null),
    skills: [],
  };
}

export function normalizeChroniclesEnemyBuild(raw, archetype = 'enemy') {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    version: CHRONICLES_ENEMY_BUILD_VERSION,
    archetype: String(source.archetype || archetype || 'enemy').trim().slice(0, 48) || 'enemy',
    level: Math.max(1, Math.min(CHRONICLES_ENEMY_LEVEL_CAP, nonNegativeInteger(source.level, 1))),
    attributes: normalizeAttributes(source.attributes),
    skills: normalizeSkills(source.skills),
  };
}

export function validateChroniclesEnemyBuild(raw) {
  if (raw == null) return { valid: true, errors: [] };
  if (!raw || typeof raw !== 'object') return { valid: false, errors: ['EnemyBuild debe ser un objeto'] };

  const errors = [];
  const version = Number(raw.version ?? CHRONICLES_ENEMY_BUILD_VERSION);
  if (!Number.isInteger(version) || version < 1 || version > CHRONICLES_ENEMY_BUILD_VERSION) {
    errors.push('Versión EnemyBuild no compatible');
  }

  const level = Number(raw.level ?? 1);
  if (!Number.isInteger(level) || level < 1 || level > CHRONICLES_ENEMY_LEVEL_CAP) {
    errors.push('Nivel enemigo fuera de rango');
  }

  const attributes = raw.attributes && typeof raw.attributes === 'object' ? raw.attributes : {};
  Object.entries(attributes).forEach(([key, value]) => {
    if (!CHRONICLES_ENEMY_ATTRIBUTE_KEYS.includes(key)) {
      errors.push(`Atributo enemigo desconocido: ${key}`);
      return;
    }
    const number = Number(value);
    if (!Number.isInteger(number) || number < 0 || number > CHRONICLES_ENEMY_ATTRIBUTE_CAP) {
      errors.push(`Atributo enemigo fuera de rango: ${key}`);
    }
  });

  const skills = Array.isArray(raw.skills) ? raw.skills : [];
  skills.forEach((skillId) => {
    if (typeof skillId !== 'string' || !CHRONICLES_ENEMY_SKILLS[skillId]) {
      errors.push(`Skill enemiga desconocida: ${String(skillId)}`);
    }
  });

  return { valid: errors.length === 0, errors };
}

export function chroniclesEnemyBuildModifiers(build) {
  const normalized = normalizeChroniclesEnemyBuild(build, build?.archetype);
  const { vigor, power, precision, will } = normalized.attributes;
  const modifiers = {
    bonusMaxHp: vigor,
    damageBonus: Math.floor(power / 2),
    reachBonus: Math.floor(precision / 2),
    engageRangeBonus: Math.floor(will / 2),
  };

  normalized.skills.forEach((skillId) => {
    const skill = CHRONICLES_ENEMY_SKILLS[skillId];
    Object.entries(skill?.modifiers || {}).forEach(([key, value]) => {
      modifiers[key] = Number(modifiers[key] || 0) + Number(value || 0);
    });
  });

  return modifiers;
}

export function chroniclesEnemySkillDetails(build) {
  const normalized = normalizeChroniclesEnemyBuild(build, build?.archetype);
  return normalized.skills.map((skillId) => CHRONICLES_ENEMY_SKILLS[skillId]);
}
