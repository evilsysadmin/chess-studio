// Party creation, Might and Magic III style (build v2).
//
// Each of the four heroes keeps their portrait and slot, but freely picks one
// of the ten MM3 classes and carries seven rolled stats (3-18). Old v1
// point-buy builds are not migrated: Chronicles saves may break (decision
// 2026-10-10), so anything that is not a valid v2 build becomes the
// canonical company. Tactics shares this company through the same party.
import {
  CHRONICLES_MM3_CLASS_IDS,
  CHRONICLES_MM3_STATS,
  chroniclesMM3ClassAllowed,
  chroniclesMM3Derived,
  chroniclesMM3RollStats,
  chroniclesMM3UnmetRequirements,
  normalizeChroniclesMM3Stats,
} from './chroniclesMM3Rules.js';

export const CHRONICLES_CHARACTER_BUILD_VERSION = 2;
export const CHRONICLES_CHARACTER_NAME_MAX = 24;

export const CHRONICLES_CHARACTER_SLOTS = Object.freeze([
  'matthias',
  'rook',
  'bishop',
  'knight',
]);

// The canonical company: a knight, a paladin, a cleric and an archer whose
// fixed stats meet their class minimums.
export const CHRONICLES_CANONICAL_CHARACTERS = Object.freeze({
  matthias: Object.freeze({
    classId: 'knight',
    stats: Object.freeze({ might: 15, intellect: 10, personality: 11, endurance: 13, speed: 12, accuracy: 13, luck: 10 }),
  }),
  rook: Object.freeze({
    classId: 'paladin',
    stats: Object.freeze({ might: 14, intellect: 9, personality: 13, endurance: 15, speed: 10, accuracy: 11, luck: 11 }),
  }),
  bishop: Object.freeze({
    classId: 'cleric',
    stats: Object.freeze({ might: 9, intellect: 12, personality: 16, endurance: 11, speed: 11, accuracy: 12, luck: 12 }),
  }),
  knight: Object.freeze({
    classId: 'archer',
    stats: Object.freeze({ might: 11, intellect: 13, personality: 10, endurance: 12, speed: 14, accuracy: 15, luck: 11 }),
  }),
});

function templateById(partyTemplates, slotId) {
  return (Array.isArray(partyTemplates) ? partyTemplates : []).find((member) => member?.id === slotId) || null;
}

function fallbackName(slotId) {
  return ({
    matthias: 'Matthias',
    rook: 'Hildegard',
    bishop: 'Aziz',
    knight: 'Faust',
  })[slotId] || slotId;
}

function cleanName(value, fallback) {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  if (!normalized) return fallback;
  return normalized.slice(0, CHRONICLES_CHARACTER_NAME_MAX);
}

function canonicalCharacter(slotId, partyTemplates) {
  const template = templateById(partyTemplates, slotId);
  const canonical = CHRONICLES_CANONICAL_CHARACTERS[slotId];
  return {
    slotId,
    classId: canonical.classId,
    name: template?.name || fallbackName(slotId),
    stats: { ...canonical.stats },
  };
}

export function createCanonicalChroniclesCharacterBuild(partyTemplates) {
  return {
    version: CHRONICLES_CHARACTER_BUILD_VERSION,
    mode: 'canonical',
    characters: CHRONICLES_CHARACTER_SLOTS.map((slotId) => canonicalCharacter(slotId, partyTemplates)),
  };
}

// The first class (in MM3 order) the rolled stats qualify for, so a reroll
// never strands a hero in a class they no longer meet.
export function chroniclesFirstAllowedClass(stats, preferred = null) {
  if (preferred && chroniclesMM3ClassAllowed(preferred, stats)) return preferred;
  return CHRONICLES_MM3_CLASS_IDS.find((classId) => chroniclesMM3ClassAllowed(classId, stats)) || null;
}

// Rolls until the stats qualify for at least one class (as the MM3 roller
// effectively forces): the creator never offers a dead-end hero.
export function chroniclesRollCharacterStats(random = Math.random, preferredClassId = null) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const stats = chroniclesMM3RollStats(random);
    const classId = chroniclesFirstAllowedClass(stats, preferredClassId);
    if (classId) return { stats, classId };
  }
  const fallback = CHRONICLES_CANONICAL_CHARACTERS.matthias;
  return { stats: { ...fallback.stats }, classId: fallback.classId };
}

function seedToUint32(seed) {
  const text = String(seed ?? '');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function chroniclesSeededRandom(seed) {
  let state = seedToUint32(seed) || 0x9e3779b9;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

// Reproducible custom company (tests, e2e fixtures): same seed, same dice.
export function createSeededChroniclesCharacterBuild(seed, partyTemplates) {
  const random = chroniclesSeededRandom(seed);
  const canonical = createCanonicalChroniclesCharacterBuild(partyTemplates);
  return {
    ...canonical,
    mode: 'custom',
    characters: canonical.characters.map((character) => ({
      ...character,
      ...chroniclesRollCharacterStats(random),
    })),
  };
}

function normalizeCharacter(slotId, raw, partyTemplates) {
  const canonical = canonicalCharacter(slotId, partyTemplates);
  const source = raw && typeof raw === 'object' ? raw : {};
  const stats = normalizeChroniclesMM3Stats(source.stats);
  if (!stats) return { ...canonical, name: cleanName(source.name, canonical.name) };
  const classId = chroniclesFirstAllowedClass(stats, CHRONICLES_MM3_CLASS_IDS.includes(source.classId) ? source.classId : null);
  if (!classId) return { ...canonical, name: cleanName(source.name, canonical.name) };
  return {
    slotId,
    classId,
    name: cleanName(source.name, canonical.name),
    stats,
  };
}

export function normalizeChroniclesCharacterBuild(raw, partyTemplates) {
  const canonical = createCanonicalChroniclesCharacterBuild(partyTemplates);
  const source = raw && typeof raw === 'object' ? raw : null;
  if (!source || source.mode !== 'custom') return canonical;
  // v1 point-buy builds are intentionally not carried over.
  if (Number(source.version) !== CHRONICLES_CHARACTER_BUILD_VERSION) return canonical;

  const rawCharacters = Array.isArray(source.characters) ? source.characters : [];
  const bySlot = new Map(
    rawCharacters
      .filter((character) => character && typeof character.slotId === 'string')
      .map((character) => [character.slotId, character]),
  );

  return {
    version: CHRONICLES_CHARACTER_BUILD_VERSION,
    mode: 'custom',
    characters: CHRONICLES_CHARACTER_SLOTS.map((slotId) => (
      normalizeCharacter(slotId, bySlot.get(slotId), partyTemplates)
    )),
  };
}

export function validateChroniclesCharacterBuild(raw) {
  if (!raw || typeof raw !== 'object') return { valid: false, errors: ['Build ausente'] };
  if (raw.mode === 'canonical') return { valid: true, errors: [] };
  if (raw.mode !== 'custom') return { valid: false, errors: ['Modo de build desconocido'] };

  const errors = [];
  if (Number(raw.version) !== CHRONICLES_CHARACTER_BUILD_VERSION) {
    errors.push('Versión de build no compatible');
  }

  const characters = Array.isArray(raw.characters) ? raw.characters : [];
  const bySlot = new Map(characters.map((character) => [character?.slotId, character]));
  const names = new Set();

  CHRONICLES_CHARACTER_SLOTS.forEach((slotId) => {
    const character = bySlot.get(slotId);
    if (!character) {
      errors.push(`Falta el personaje de ${slotId}`);
      return;
    }
    const name = String(character.name || '').trim().replace(/\s+/g, ' ');
    if (!name) {
      errors.push(`Nombre vacío para ${slotId}`);
    } else if (name.length > CHRONICLES_CHARACTER_NAME_MAX) {
      errors.push(`Nombre demasiado largo para ${slotId}`);
    } else {
      const key = name.toLocaleLowerCase('es');
      if (names.has(key)) errors.push(`Nombre duplicado: ${name}`);
      names.add(key);
    }

    const stats = normalizeChroniclesMM3Stats(character.stats);
    const exact = stats && CHRONICLES_MM3_STATS.every((key) => stats[key] === character.stats?.[key]);
    if (!exact) {
      errors.push(`Estadísticas inválidas para ${name || slotId}`);
      return;
    }
    if (!CHRONICLES_MM3_CLASS_IDS.includes(character.classId)) {
      errors.push(`Clase desconocida para ${name || slotId}`);
      return;
    }
    const unmet = chroniclesMM3UnmetRequirements(character.classId, stats);
    if (unmet.length) {
      errors.push(`${name || slotId} no cumple los requisitos de su clase`);
    }
  });

  return { valid: errors.length === 0, errors };
}

// Legacy-shaped creator modifiers for systems that still read them (Tactics
// profiles, progression reconcile). The MM3 sheet does not feed Tactics.
export function chroniclesCreatorRuntimeModifiers() {
  return {
    bonusMaxHp: 0,
    attackDamageBonus: 0,
    reachBonus: 0,
    abilityPotencyBonus: 0,
    abilityChargesBonus: 0,
  };
}

// With `rules: 'mm3'` (first-person Chronicles) class and Endurance own HP,
// Might shifts damage, and the hero carries the MM3 sheet that equipment,
// initiative, to-hit and saves read. Without it (Tactics) the party keeps
// its authored chess-piece profiles and only the names change.
export function resolveChroniclesCharacterParty(partyTemplates, rawBuild, { rules = null } = {}) {
  const normalized = normalizeChroniclesCharacterBuild(rawBuild, partyTemplates);
  const characters = new Map(normalized.characters.map((character) => [character.slotId, character]));
  const mm3 = rules === 'mm3';

  return (Array.isArray(partyTemplates) ? partyTemplates : []).map((template) => {
    const character = characters.get(template.id) || canonicalCharacter(template.id, partyTemplates);
    const derived = chroniclesMM3Derived(character.classId, character.stats);
    return {
      ...template,
      name: character.name,
      maxHp: mm3 ? derived.maxHp : Math.max(1, Number(template.maxHp || 1)),
      damage: Math.max(1, Number(template.damage || 1) + (mm3 ? derived.damageBonus : 0)),
      reach: Math.max(1, Number(template.reach || 1)),
      ...(mm3 ? {
        mm3: {
          classId: derived.classId,
          classLabel: derived.classLabel,
          stats: { ...character.stats },
          bonuses: { ...derived.bonuses },
        },
      } : {}),
      characterBuild: {
        version: normalized.version,
        mode: normalized.mode,
        slotId: template.id,
        classId: character.classId,
        stats: { ...character.stats },
        creatorModifiers: chroniclesCreatorRuntimeModifiers(),
      },
    };
  });
}
