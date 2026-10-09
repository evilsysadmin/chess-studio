// Canonical MM3 statistics, modelled separately from legacy Chronicles
// progression until the versioned profile migration is ready.
// This is a read-only compatibility projection: it does not change combat,
// invent spent points, or write to a user's profile.
export const CHRONICLES_MM3_STATS = Object.freeze([
  Object.freeze({ id: 'might', label: 'Fuerza', mm3: 'Might', short: 'MGT' }),
  Object.freeze({ id: 'intellect', label: 'Intelecto', mm3: 'Intellect', short: 'INT' }),
  Object.freeze({ id: 'personality', label: 'Personalidad', mm3: 'Personality', short: 'PER' }),
  Object.freeze({ id: 'endurance', label: 'Resistencia', mm3: 'Endurance', short: 'END' }),
  Object.freeze({ id: 'speed', label: 'Velocidad', mm3: 'Speed', short: 'SPD' }),
  Object.freeze({ id: 'accuracy', label: 'Precisión', mm3: 'Accuracy', short: 'ACY' }),
  Object.freeze({ id: 'luck', label: 'Suerte', mm3: 'Luck', short: 'LCK' }),
]);

export const CHRONICLES_MM3_RESISTANCES = Object.freeze([
  'fire', 'cold', 'electricity', 'poison-acid', 'energy', 'magic',
]);

export const CHRONICLES_MM3_STAT_BASELINE = 10;

const LEGACY_TO_MM3 = Object.freeze({
  vigor: 'endurance',
  power: 'might',
  precision: 'accuracy',
  agility: 'speed',
});

function safeStat(value, fallback = CHRONICLES_MM3_STAT_BASELINE) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 999) return fallback;
  return value;
}

/**
 * Interpret the existing profile without mutating its source. Values of
 * existing bonus attributes are applied exactly once over a neutral baseline.
 * The legacy 'will' point pool remains in the original profile/ability
 * modifiers. It cannot be safely divided into Intellect and Personality.
 *
 * The future v2 profile may pass an explicit seven-stat record; in that case
 * old bonuses must NOT be added again. This is a data contract only, not an
 * alternate authority for damage, initiative, XP or spellcasting.
 */
export function chroniclesMM3StatSnapshot(hero = {}, explicitStats = null) {
  const hasCanonical = explicitStats && typeof explicitStats === 'object'
    && !Array.isArray(explicitStats);
  const result = Object.fromEntries(
    CHRONICLES_MM3_STATS.map(({ id }) => [id, CHRONICLES_MM3_STAT_BASELINE]),
  );

  if (hasCanonical) {
    for (const { id } of CHRONICLES_MM3_STATS) result[id] = safeStat(explicitStats[id]);
    return Object.freeze({ schema: 'mm3-v2', attributes: Object.freeze(result) });
  }

  const legacy = hero?.attributes && typeof hero.attributes === 'object' && !Array.isArray(hero.attributes)
    ? hero.attributes : {};
  for (const [oldName, newName] of Object.entries(LEGACY_TO_MM3)) {
    const bonus = legacy[oldName];
    if (Number.isSafeInteger(bonus) && bonus > 0 && bonus <= 5) {
      result[newName] += bonus;
    }
  }
  return Object.freeze({ schema: 'legacy-v1-projection', attributes: Object.freeze(result) });
}
