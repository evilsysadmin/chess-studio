export const CHRONICLES_CHARACTER_BUILD_VERSION = 1;
export const CHRONICLES_CREATOR_ATTRIBUTE_BUDGET = 3;
export const CHRONICLES_CREATOR_ATTRIBUTE_CAP = 2;
export const CHRONICLES_CHARACTER_NAME_MAX = 24;

export const CHRONICLES_CHARACTER_SLOTS = Object.freeze([
  'matthias',
  'rook',
  'bishop',
  'knight',
]);

export const CHRONICLES_CREATOR_ATTRIBUTE_KEYS = Object.freeze([
  'vigor',
  'power',
  'precision',
  'will',
]);

export const CHRONICLES_CREATOR_RULES = Object.freeze({
  matthias: Object.freeze({
    classLabel: 'Espadachín',
    allowedAttributes: Object.freeze(['vigor', 'power', 'will']),
    startingSkills: Object.freeze([
      Object.freeze({
        id: 'matthias-keen-point',
        label: 'Punta afilada',
        description: '+1 daño con el ataque básico.',
        modifiers: Object.freeze({ attackDamageBonus: 1 }),
      }),
      Object.freeze({
        id: 'matthias-field-discipline',
        label: 'Disciplina de campaña',
        description: '+1 vida máxima al iniciar la incursión.',
        modifiers: Object.freeze({ bonusMaxHp: 1 }),
      }),
    ]),
  }),
  rook: Object.freeze({
    classLabel: 'Guardiana',
    allowedAttributes: Object.freeze(['vigor', 'power', 'will']),
    startingSkills: Object.freeze([
      Object.freeze({
        id: 'rook-bulwark-drill',
        label: 'Drill de baluarte',
        description: '+2 vida máxima al iniciar la incursión.',
        modifiers: Object.freeze({ bonusMaxHp: 2 }),
      }),
      Object.freeze({
        id: 'rook-crushing-form',
        label: 'Forma demoledora',
        description: '+1 daño con el ataque básico.',
        modifiers: Object.freeze({ attackDamageBonus: 1 }),
      }),
    ]),
  }),
  bishop: Object.freeze({
    classLabel: 'Taumaturgo',
    allowedAttributes: Object.freeze(['vigor', 'precision', 'will']),
    startingSkills: Object.freeze([
      Object.freeze({
        id: 'bishop-lumen-initiate',
        label: 'Iniciado del lumen',
        description: '+1 potencia para la habilidad de clase.',
        modifiers: Object.freeze({ abilityPotencyBonus: 1 }),
      }),
      Object.freeze({
        id: 'bishop-long-diagonal',
        label: 'Diagonal larga',
        description: '+1 alcance con el ataque básico.',
        modifiers: Object.freeze({ reachBonus: 1 }),
      }),
    ]),
  }),
  knight: Object.freeze({
    classLabel: 'Hostigador',
    allowedAttributes: Object.freeze(['vigor', 'precision', 'will']),
    startingSkills: Object.freeze([
      Object.freeze({
        id: 'knight-marksman-drill',
        label: 'Tiro de campaña',
        description: '+1 alcance con el ataque básico.',
        modifiers: Object.freeze({ reachBonus: 1 }),
      }),
      Object.freeze({
        id: 'knight-reserve-quiver',
        label: 'Carcaj de reserva',
        description: '+1 carga de habilidad por incursión.',
        modifiers: Object.freeze({ abilityCharges: 1 }),
      }),
    ]),
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

function nonNegativeInteger(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

function emptyAttributes() {
  return Object.fromEntries(CHRONICLES_CREATOR_ATTRIBUTE_KEYS.map((key) => [key, 0]));
}

function normalizeAttributes(slotId, raw) {
  const rules = CHRONICLES_CREATOR_RULES[slotId];
  const source = raw && typeof raw === 'object' ? raw : {};
  const result = emptyAttributes();
  let remaining = CHRONICLES_CREATOR_ATTRIBUTE_BUDGET;

  rules.allowedAttributes.forEach((key) => {
    if (remaining <= 0) return;
    const requested = Math.min(
      CHRONICLES_CREATOR_ATTRIBUTE_CAP,
      nonNegativeInteger(source[key]),
    );
    const granted = Math.min(remaining, requested);
    result[key] = granted;
    remaining -= granted;
  });

  return result;
}

export function chroniclesCreatorSkillsForSlot(slotId) {
  return CHRONICLES_CREATOR_RULES[slotId]?.startingSkills || Object.freeze([]);
}

export function chroniclesCreatorSkill(slotId, skillId) {
  if (!skillId) return null;
  return chroniclesCreatorSkillsForSlot(slotId).find((skill) => skill.id === skillId) || null;
}

export function chroniclesCreatorRuntimeModifiers(character) {
  const slotId = character?.slotId;
  const attributes = character?.attributes && typeof character.attributes === 'object'
    ? character.attributes
    : emptyAttributes();
  const skill = chroniclesCreatorSkill(slotId, character?.startingSkillId);
  const skillModifiers = skill?.modifiers || {};
  const physical = slotId === 'matthias' || slotId === 'rook';
  const rangedOrMagic = slotId === 'bishop' || slotId === 'knight';
  const vigor = nonNegativeInteger(attributes.vigor);
  const power = nonNegativeInteger(attributes.power);
  const precision = nonNegativeInteger(attributes.precision);
  const will = nonNegativeInteger(attributes.will);

  return {
    bonusMaxHp: vigor + nonNegativeInteger(skillModifiers.bonusMaxHp),
    attackDamageBonus: (physical ? Math.floor(power / 2) : Math.floor(precision / 3))
      + nonNegativeInteger(skillModifiers.attackDamageBonus),
    reachBonus: (rangedOrMagic ? Math.floor(precision / 2) : 0)
      + nonNegativeInteger(skillModifiers.reachBonus),
    abilityPotencyBonus: (physical ? Math.floor(power / 2) : Math.floor(precision / 3))
      + Math.floor(will / 2)
      + nonNegativeInteger(skillModifiers.abilityPotencyBonus),
    abilityChargesBonus: nonNegativeInteger(skillModifiers.abilityCharges),
  };
}

function canonicalCharacter(slotId, partyTemplates) {
  const template = templateById(partyTemplates, slotId);
  return {
    slotId,
    classId: slotId,
    name: template?.name || fallbackName(slotId),
    attributes: emptyAttributes(),
    startingSkillId: null,
  };
}

export function createCanonicalChroniclesCharacterBuild(partyTemplates) {
  return {
    version: CHRONICLES_CHARACTER_BUILD_VERSION,
    mode: 'canonical',
    characters: CHRONICLES_CHARACTER_SLOTS.map((slotId) => canonicalCharacter(slotId, partyTemplates)),
  };
}

function normalizeCharacter(slotId, raw, partyTemplates) {
  const canonical = canonicalCharacter(slotId, partyTemplates);
  const source = raw && typeof raw === 'object' ? raw : {};
  const skill = chroniclesCreatorSkill(slotId, source.startingSkillId);

  return {
    slotId,
    classId: slotId,
    name: cleanName(source.name, canonical.name),
    attributes: normalizeAttributes(slotId, source.attributes),
    startingSkillId: skill?.id || null,
  };
}

export function normalizeChroniclesCharacterBuild(raw, partyTemplates) {
  const canonical = createCanonicalChroniclesCharacterBuild(partyTemplates);
  const source = raw && typeof raw === 'object' ? raw : null;
  if (!source || source.mode !== 'custom') return canonical;

  const version = nonNegativeInteger(source.version);
  if (version > CHRONICLES_CHARACTER_BUILD_VERSION) return canonical;

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

function rawAttributesTotal(source) {
  return CHRONICLES_CREATOR_ATTRIBUTE_KEYS.reduce(
    (total, key) => total + nonNegativeInteger(source?.[key]),
    0,
  );
}

export function validateChroniclesCharacterBuild(raw) {
  if (!raw || typeof raw !== 'object') return { valid: false, errors: ['Build ausente'] };
  if (raw.mode === 'canonical') return { valid: true, errors: [] };
  if (raw.mode !== 'custom') return { valid: false, errors: ['Modo de build desconocido'] };

  const errors = [];
  if (Number(raw.version) > CHRONICLES_CHARACTER_BUILD_VERSION) {
    errors.push('Versión de build futura no compatible');
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
    if (character.classId != null && character.classId !== slotId) {
      errors.push(`Clase inválida para ${slotId}`);
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

    const rules = CHRONICLES_CREATOR_RULES[slotId];
    const attributes = character.attributes && typeof character.attributes === 'object'
      ? character.attributes
      : {};
    if (rawAttributesTotal(attributes) > CHRONICLES_CREATOR_ATTRIBUTE_BUDGET) {
      errors.push(`Presupuesto de atributos excedido para ${slotId}`);
    }

    Object.entries(attributes).forEach(([key, value]) => {
      const numeric = Number(value);
      if (!CHRONICLES_CREATOR_ATTRIBUTE_KEYS.includes(key) && nonNegativeInteger(value) > 0) {
        errors.push(`Atributo desconocido para ${slotId}: ${key}`);
        return;
      }
      if (!rules.allowedAttributes.includes(key) && nonNegativeInteger(value) > 0) {
        errors.push(`Atributo no permitido para ${slotId}: ${key}`);
      }
      if (!Number.isInteger(numeric) || numeric < 0 || numeric > CHRONICLES_CREATOR_ATTRIBUTE_CAP) {
        errors.push(`Valor de atributo inválido para ${slotId}: ${key}`);
      }
    });

    if (character.startingSkillId && !chroniclesCreatorSkill(slotId, character.startingSkillId)) {
      errors.push(`Skill inicial desconocida para ${slotId}`);
    }
  });

  return { valid: errors.length === 0, errors };
}

export function resolveChroniclesCharacterParty(partyTemplates, rawBuild) {
  const normalized = normalizeChroniclesCharacterBuild(rawBuild, partyTemplates);
  const characters = new Map(normalized.characters.map((character) => [character.slotId, character]));

  return (Array.isArray(partyTemplates) ? partyTemplates : []).map((template) => {
    const character = characters.get(template.id) || canonicalCharacter(template.id, partyTemplates);
    const skill = chroniclesCreatorSkill(template.id, character.startingSkillId);
    const creatorModifiers = chroniclesCreatorRuntimeModifiers(character);
    return {
      ...template,
      name: character.name,
      maxHp: Math.max(1, Number(template.maxHp || 1) + creatorModifiers.bonusMaxHp),
      damage: Math.max(1, Number(template.damage || 1) + creatorModifiers.attackDamageBonus),
      reach: Math.max(1, Number(template.reach || 1) + creatorModifiers.reachBonus),
      characterBuild: {
        version: normalized.version,
        mode: normalized.mode,
        slotId: template.id,
        classId: character.classId,
        attributes: { ...character.attributes },
        startingSkillId: character.startingSkillId,
        startingSkillModifiers: { ...(skill?.modifiers || {}) },
        creatorModifiers,
      },
    };
  });
}
