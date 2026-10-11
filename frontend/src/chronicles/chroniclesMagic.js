// Might and Magic III magic for first-person Chronicles.
//
// The manual: «All spells were forged through the mysteries of Cosmonium,
// Esoterica and Gaiam, and only those classes devoted to their study can
// cast them». Sorcerer and Archer serve Cosmonium, Cleric and Paladin serve
// Esoterica, Druid and Ranger serve Gaiam. Spell points come from the
// class's casting stat (Intellect or Personality) and grow with level; the
// hybrids get half. New incantations are bought at a guild once the company
// holds its membership, and resting at the inn restores every spell point.
//
// State: `spellPoints[memberId]` (missing = full) and `spellbook[memberId]`
// (missing = the school's starting spells). Both persist in the checkpoint.
import { chroniclesMM3Class, chroniclesMM3StatBonus } from './chroniclesMM3Rules.js';

export const CHRONICLES_SPELL_SCHOOLS = Object.freeze({
  cosmonium: Object.freeze({ id: 'cosmonium', label: 'Cosmonium', summary: 'Los elementos: magia arcana.' }),
  esoterica: Object.freeze({ id: 'esoterica', label: 'Esoterica', summary: 'Mente, cuerpo y curación: magia clerical.' }),
  gaiam: Object.freeze({ id: 'gaiam', label: 'Gaiam', summary: 'La naturaleza: magia druídica.' }),
});

const CLASS_SCHOOL = Object.freeze({
  sorcerer: 'cosmonium', archer: 'cosmonium',
  cleric: 'esoterica', paladin: 'esoterica',
  druid: 'gaiam', ranger: 'gaiam',
});
const FULL_CASTERS = new Set(['sorcerer', 'cleric', 'druid']);

function spell(spec) {
  return Object.freeze({ ...spec, schools: Object.freeze([...spec.schools]) });
}

// Novice spells from the MM3 manual that have a system to act on today.
// Light and Awaken arrive with dark dungeons and the sleep condition.
export const CHRONICLES_SPELLS = Object.freeze({
  'first-aid': spell({
    id: 'first-aid', name: 'Primeros auxilios', schools: ['esoterica', 'gaiam'], cost: 1, price: 8,
    kind: 'heal', amount: 6,
    description: 'Cura 6 PV al compañero más herido. Sirve en combate y fuera de él.',
  }),
  'flying-fist': spell({
    id: 'flying-fist', name: 'Puño volador', schools: ['esoterica'], cost: 2, price: 12,
    kind: 'attack', damage: 6, reach: 2, element: 'energy',
    description: 'Un guantelete encantado golpea a un enemigo a dos casillas. No falla.',
  }),
  'elemental-arrow': spell({
    id: 'elemental-arrow', name: 'Flecha elemental', schools: ['cosmonium', 'gaiam'], cost: 2, price: 15,
    kind: 'attack', damage: 8, reach: 3, element: 'fire',
    description: 'Un dardo de fuego a tres casillas. No falla.',
  }),
  'detect-magic': spell({
    id: 'detect-magic', name: 'Detectar magia', schools: ['cosmonium'], cost: 1, price: 8,
    kind: 'detect',
    description: 'Revela cuántos tesoros quedan sin abrir en esta zona y hacia dónde.',
  }),
});

export const CHRONICLES_ELEMENT_LABELS = Object.freeze({
  fire: 'fuego', electricity: 'electricidad', cold: 'frío', poison: 'veneno', energy: 'energía', magic: 'magia',
});

const STARTING_SPELLS = Object.freeze({
  cosmonium: Object.freeze(['detect-magic']),
  esoterica: Object.freeze(['first-aid']),
  gaiam: Object.freeze(['first-aid']),
});

function classIdOf(member) {
  return member?.mm3?.classId || null;
}

export function chroniclesMemberSchool(member) {
  return CLASS_SCHOOL[classIdOf(member)] || null;
}

export function chroniclesMemberLevel(state, memberId) {
  return Math.max(1, Math.floor(Number(state?.rpgModifiers?.[memberId]?.level) || 1));
}

// MM3: spell points per level = 3 + casting-stat bonus (at least 1);
// Paladin, Archer and Ranger get half, rounded down, never below one.
export function chroniclesMemberMaxSp(state, member) {
  const school = chroniclesMemberSchool(member);
  if (!school) return 0;
  const definition = chroniclesMM3Class(classIdOf(member));
  const bonus = chroniclesMM3StatBonus(member.mm3?.stats?.[definition?.spellStat]);
  const full = chroniclesMemberLevel(state, member.id) * Math.max(1, 3 + bonus);
  return FULL_CASTERS.has(classIdOf(member)) ? full : Math.max(1, Math.floor(full / 2));
}

export function chroniclesMemberSp(state, member) {
  const max = chroniclesMemberMaxSp(state, member);
  const stored = state?.spellPoints?.[member?.id];
  if (!Number.isInteger(stored)) return max;
  return Math.max(0, Math.min(max, stored));
}

export function chroniclesSpellAvailableTo(member, spellId) {
  const definition = CHRONICLES_SPELLS[spellId];
  const school = chroniclesMemberSchool(member);
  return Boolean(definition && school && definition.schools.includes(school));
}

export function chroniclesMemberSpells(state, member) {
  const school = chroniclesMemberSchool(member);
  if (!school) return [];
  const stored = state?.spellbook?.[member.id];
  const ids = Array.isArray(stored) ? stored : STARTING_SPELLS[school];
  return ids.filter((id) => chroniclesSpellAvailableTo(member, id)).map((id) => CHRONICLES_SPELLS[id]);
}

export function chroniclesMemberKnowsSpell(state, member, spellId) {
  return chroniclesMemberSpells(state, member).some((entry) => entry.id === spellId);
}

export function chroniclesSpendSp(state, memberId, amount) {
  const member = state.party.find((entry) => entry.id === memberId);
  return {
    ...state,
    spellPoints: { ...state.spellPoints, [memberId]: chroniclesMemberSp(state, member) - amount },
  };
}

// Resting at the inn: every caster back to full.
export function chroniclesRestoreSpellPoints(state) {
  if (!state?.spellPoints) return state;
  const { spellPoints: _spent, ...rested } = state;
  return rested;
}

export function chroniclesLearnSpell(state, memberId, spellId) {
  const member = state.party.find((entry) => entry.id === memberId);
  if (!member || !chroniclesSpellAvailableTo(member, spellId) || chroniclesMemberKnowsSpell(state, member, spellId)) {
    return state;
  }
  const known = chroniclesMemberSpells(state, member).map((entry) => entry.id);
  return { ...state, spellbook: { ...state.spellbook, [memberId]: [...known, spellId] } };
}

// The ally a healing spell should land on: lowest HP share among the living.
export function chroniclesMostWoundedAlly(state) {
  return (state.party || [])
    .filter((member) => member.hp > 0 && member.hp < member.maxHp)
    .sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0] || null;
}

// Damage after the target's resistance to the spell's element (percent).
export function chroniclesSpellDamage(definition, enemy) {
  const resistance = Math.max(0, Math.min(100, Number(enemy?.resistances?.[definition.element] || 0)));
  return Math.max(0, Math.round(definition.damage * (100 - resistance) / 100));
}

const DIRECTION_WORDS = Object.freeze({ n: 'norte', s: 'sur', e: 'este', o: 'oeste' });

export function chroniclesDetectMagicMessage(caster, treasures, state) {
  if (!treasures.length) {
    return `${caster.name} conjura Detectar magia. Nada vibra en esta zona: no quedan tesoros por abrir.`;
  }
  const nearest = [...treasures].sort((a, b) => (
    (Math.abs(a.x - state.x) + Math.abs(a.y - state.y)) - (Math.abs(b.x - state.x) + Math.abs(b.y - state.y))
  ))[0];
  const dx = nearest.x - state.x;
  const dy = nearest.y - state.y;
  const heading = [dy < 0 ? 'n' : dy > 0 ? 's' : '', dx > 0 ? 'e' : dx < 0 ? 'o' : '']
    .filter(Boolean).map((key) => DIRECTION_WORDS[key]).join(' y ') || 'bajo tus pies';
  const count = treasures.length === 1 ? 'Queda un tesoro' : `Quedan ${treasures.length} tesoros`;
  return `${caster.name} conjura Detectar magia. ${count} sin abrir en esta zona; el más cercano, hacia el ${heading}.`
    .replace('hacia el bajo tus pies', 'bajo tus pies');
}
