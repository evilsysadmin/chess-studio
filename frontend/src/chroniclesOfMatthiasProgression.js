import { chroniclesMapForState } from './chronicles/chroniclesMapCatalog.js';
import {
  STORAGE_LOCAL,
  getStorageItem,
  readJsonStorage,
  setStorageItem,
} from './safeStorage.js';
import { setProfileStorageItem } from './profileKeys.js';

export const CHRONICLES_PROGRESSION_STORAGE_KEY = 'chess-study-chronicles-progression-v1';
export const CHRONICLES_TACTICS_RUN_STORAGE_KEY = 'chess-study-chronicles-tactics-run-v1';
export const CHRONICLES_PROGRESSION_VERSION = 1;
export const CHRONICLES_MAX_LEVEL = 12;
export const CHRONICLES_ATTRIBUTE_CAP = 5;

const AUTH_USERNAME_KEY = 'chess-study-auth-username';
const HERO_IDS = Object.freeze(['matthias', 'rook', 'bishop', 'knight']);
const CLAIM_LIMIT = 256;
const ATTRIBUTE_KEYS = Object.freeze(['vigor', 'power', 'precision', 'will']);

export const CHRONICLES_ATTRIBUTE_DEFINITIONS = Object.freeze({
  vigor: Object.freeze({ label: 'Vigor', shortLabel: 'VIG', effect: '+1 vida máxima por punto' }),
  power: Object.freeze({ label: 'Potencia', shortLabel: 'POT', effect: '+1 daño físico cada 2 puntos' }),
  precision: Object.freeze({ label: 'Precisión', shortLabel: 'PRE', effect: '+1 alcance cada 2; +1 daño a distancia/magia cada 3' }),
  will: Object.freeze({ label: 'Voluntad', shortLabel: 'VOL', effect: '+1 potencia de habilidad cada 2; +1 carga al llegar a 3' }),
});

const ALLOWED_ATTRIBUTES = Object.freeze({
  matthias: Object.freeze(['vigor', 'power', 'will']),
  rook: Object.freeze(['vigor', 'power', 'will']),
  bishop: Object.freeze(['vigor', 'precision', 'will']),
  knight: Object.freeze(['vigor', 'precision', 'will']),
});

export const CHRONICLES_SKILL_DEFINITIONS = Object.freeze({
  matthias: Object.freeze([
    Object.freeze({
      id: 'matthias-steel-tempo',
      label: 'Tempo de hierro',
      description: '+1 daño con la estocada básica.',
      requiredLevel: 2,
      cost: 1,
      group: 'doctrine-1',
      modifiers: Object.freeze({ attackDamageBonus: 1 }),
    }),
    Object.freeze({
      id: 'matthias-master-rupture',
      label: 'Ruptura maestra',
      description: '+2 potencia para Ruptura teutona.',
      requiredLevel: 2,
      cost: 1,
      group: 'doctrine-1',
      modifiers: Object.freeze({ abilityPotencyBonus: 2 }),
    }),
  ]),
  rook: Object.freeze([
    Object.freeze({
      id: 'rook-living-wall',
      label: 'Muralla viva',
      description: '+2 vida máxima al iniciar incursión.',
      requiredLevel: 2,
      cost: 1,
      group: 'doctrine-1',
      modifiers: Object.freeze({ bonusMaxHp: 2 }),
    }),
    Object.freeze({
      id: 'rook-siege-doctrine',
      label: 'Doctrina de asedio',
      description: '+2 potencia para Martillo de asedio.',
      requiredLevel: 2,
      cost: 1,
      group: 'doctrine-1',
      modifiers: Object.freeze({ abilityPotencyBonus: 2 }),
    }),
  ]),
  bishop: Object.freeze([
    Object.freeze({
      id: 'bishop-lumen-maior',
      label: 'Lumen maior',
      description: '+1 potencia de curación del farol.',
      requiredLevel: 2,
      cost: 1,
      group: 'doctrine-1',
      modifiers: Object.freeze({ abilityPotencyBonus: 1 }),
    }),
    Object.freeze({
      id: 'bishop-sacred-geometry',
      label: 'Geometría sagrada',
      description: '+1 daño con el rayo diagonal.',
      requiredLevel: 2,
      cost: 1,
      group: 'doctrine-1',
      modifiers: Object.freeze({ attackDamageBonus: 1 }),
    }),
    Object.freeze({
      id: 'bishop-dawn-orb',
      label: 'Orbe de alba',
      description: 'Transforma Luz del farol en un hechizo de restauración más potente: +2 curación.',
      requiredLevel: 4,
      cost: 1,
      group: 'grimoire-1',
      modifiers: Object.freeze({ abilityPotencyBonus: 2 }),
      profileOverrides: Object.freeze({
        abilityName: 'Orbe de alba',
        abilityLabel: 'hechizo de restauración',
      }),
    }),
    Object.freeze({
      id: 'bishop-twin-lumen',
      label: 'Lumen geminado',
      description: 'Transforma Luz del farol en un hechizo de doble reserva: +1 lanzamiento por incursión.',
      requiredLevel: 4,
      cost: 1,
      group: 'grimoire-1',
      modifiers: Object.freeze({ abilityCharges: 1 }),
      profileOverrides: Object.freeze({
        abilityName: 'Lumen geminado',
        abilityLabel: 'hechizo de reserva',
      }),
    }),
  ]),
  knight: Object.freeze([
    Object.freeze({
      id: 'knight-heavy-bolts',
      label: 'Virotes pesados',
      description: '+1 daño con la ballesta básica.',
      requiredLevel: 2,
      cost: 1,
      group: 'doctrine-1',
      modifiers: Object.freeze({ attackDamageBonus: 1 }),
    }),
    Object.freeze({
      id: 'knight-double-quiver',
      label: 'Carcaj doble',
      description: '+1 carga de Salva de virotes por incursión.',
      requiredLevel: 2,
      cost: 1,
      group: 'doctrine-1',
      modifiers: Object.freeze({ abilityCharges: 1 }),
    }),
  ]),
});

function nonNegativeInteger(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.floor(number));
}

export function chroniclesXpThresholdForLevel(level) {
  const safeLevel = Math.max(1, Math.min(CHRONICLES_MAX_LEVEL, nonNegativeInteger(level, 1)));
  if (safeLevel <= 1) return 0;
  return 20 * (safeLevel - 1) * safeLevel;
}

export function chroniclesLevelForXp(xp) {
  const safeXp = nonNegativeInteger(xp);
  let level = 1;
  while (level < CHRONICLES_MAX_LEVEL && safeXp >= chroniclesXpThresholdForLevel(level + 1)) level += 1;
  return level;
}

function defaultAttributes() {
  return { vigor: 0, power: 0, precision: 0, will: 0 };
}

function defaultHero() {
  return {
    level: 1,
    xp: 0,
    attributePoints: 0,
    skillPoints: 0,
    attributes: defaultAttributes(),
    skills: [],
  };
}

function normalizeAttributes(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return ATTRIBUTE_KEYS.reduce((result, key) => {
    result[key] = Math.min(CHRONICLES_ATTRIBUTE_CAP, nonNegativeInteger(source[key]));
    return result;
  }, {});
}

function normalizeHero(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const maxXp = chroniclesXpThresholdForLevel(CHRONICLES_MAX_LEVEL);
  const xp = Math.min(maxXp, nonNegativeInteger(source.xp));
  return {
    level: chroniclesLevelForXp(xp),
    xp,
    attributePoints: Math.min(99, nonNegativeInteger(source.attributePoints)),
    skillPoints: Math.min(99, nonNegativeInteger(source.skillPoints)),
    attributes: normalizeAttributes(source.attributes),
    skills: Array.isArray(source.skills)
      ? [...new Set(source.skills.filter((skill) => typeof skill === 'string' && skill.trim()).map((skill) => skill.trim()))].slice(0, 64)
      : [],
  };
}

export function createChroniclesProgression() {
  return {
    version: CHRONICLES_PROGRESSION_VERSION,
    heroes: Object.fromEntries(HERO_IDS.map((id) => [id, defaultHero()])),
    claimedAwards: [],
  };
}

export function normalizeChroniclesProgression(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const heroes = Object.fromEntries(HERO_IDS.map((id) => [id, normalizeHero(source.heroes?.[id])]));
  const claimedAwards = Array.isArray(source.claimedAwards)
    ? [...new Set(source.claimedAwards.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim()))].slice(-CLAIM_LIMIT)
    : [];
  return {
    version: CHRONICLES_PROGRESSION_VERSION,
    heroes,
    claimedAwards,
  };
}

export function loadChroniclesProgression() {
  return normalizeChroniclesProgression(readJsonStorage(STORAGE_LOCAL, CHRONICLES_PROGRESSION_STORAGE_KEY, { fallback: null }));
}

export function saveChroniclesProgression(progression) {
  const normalized = normalizeChroniclesProgression(progression);
  setProfileStorageItem(CHRONICLES_PROGRESSION_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function chroniclesHeroProgress(progression, memberId) {
  const normalized = normalizeChroniclesProgression(progression);
  return normalized.heroes[memberId] || defaultHero();
}

export function chroniclesXpToNextLevel(progression, memberId) {
  const hero = chroniclesHeroProgress(progression, memberId);
  if (hero.level >= CHRONICLES_MAX_LEVEL) return { current: hero.xp, next: hero.xp, remaining: 0, maxLevel: true };
  const next = chroniclesXpThresholdForLevel(hero.level + 1);
  return { current: hero.xp, next, remaining: Math.max(0, next - hero.xp), maxLevel: false };
}

export function chroniclesAllowedAttributes(memberId) {
  return ALLOWED_ATTRIBUTES[memberId] || Object.freeze([]);
}

export function spendChroniclesAttributePoint(progression, memberId, attributeKey) {
  const current = normalizeChroniclesProgression(progression);
  if (!HERO_IDS.includes(memberId)) return { progression: current, spent: false, reason: 'Héroe desconocido' };
  if (!chroniclesAllowedAttributes(memberId).includes(attributeKey)) {
    return { progression: current, spent: false, reason: 'Atributo ajeno a esta clase' };
  }
  const hero = current.heroes[memberId];
  if (hero.attributePoints <= 0) return { progression: current, spent: false, reason: 'Sin puntos de atributo' };
  if (hero.attributes[attributeKey] >= CHRONICLES_ATTRIBUTE_CAP) {
    return { progression: current, spent: false, reason: 'Atributo al máximo' };
  }
  const nextHero = {
    ...hero,
    attributePoints: hero.attributePoints - 1,
    attributes: {
      ...hero.attributes,
      [attributeKey]: hero.attributes[attributeKey] + 1,
    },
  };
  return {
    progression: {
      ...current,
      heroes: { ...current.heroes, [memberId]: nextHero },
    },
    spent: true,
    reason: '',
  };
}

export function chroniclesSkillsForMember(memberId) {
  return CHRONICLES_SKILL_DEFINITIONS[memberId] || Object.freeze([]);
}

export function unlockChroniclesSkill(progression, memberId, skillId) {
  const current = normalizeChroniclesProgression(progression);
  if (!HERO_IDS.includes(memberId)) return { progression: current, unlocked: false, reason: 'Héroe desconocido' };
  const skill = chroniclesSkillsForMember(memberId).find((candidate) => candidate.id === skillId);
  if (!skill) return { progression: current, unlocked: false, reason: 'Técnica desconocida' };
  const hero = current.heroes[memberId];
  if (hero.skills.includes(skill.id)) return { progression: current, unlocked: false, reason: 'Técnica ya aprendida' };
  if (hero.level < skill.requiredLevel) return { progression: current, unlocked: false, reason: `Requiere nivel ${skill.requiredLevel}` };
  if (hero.skillPoints < skill.cost) return { progression: current, unlocked: false, reason: 'Sin puntos de skill' };
  const competing = chroniclesSkillsForMember(memberId).find((candidate) => (
    candidate.group === skill.group && hero.skills.includes(candidate.id)
  ));
  if (competing) return { progression: current, unlocked: false, reason: `Doctrina ya fijada: ${competing.label}` };

  const nextHero = {
    ...hero,
    skillPoints: hero.skillPoints - skill.cost,
    skills: [...hero.skills, skill.id],
  };
  return {
    progression: {
      ...current,
      heroes: { ...current.heroes, [memberId]: nextHero },
    },
    unlocked: true,
    reason: '',
    skill,
  };
}

function skillModifiersFor(hero, memberId) {
  return chroniclesSkillsForMember(memberId).reduce((result, skill) => {
    if (!hero.skills.includes(skill.id)) return result;
    Object.entries(skill.modifiers || {}).forEach(([key, value]) => {
      result[key] = Number(result[key] || 0) + Number(value || 0);
    });
    return result;
  }, {});
}

function skillProfileOverridesFor(hero, memberId) {
  return chroniclesSkillsForMember(memberId).reduce((result, skill) => {
    if (!hero.skills.includes(skill.id) || !skill.profileOverrides) return result;
    return { ...result, ...skill.profileOverrides };
  }, {});
}

export function chroniclesTacticsModifiers(progression, memberId) {
  const hero = chroniclesHeroProgress(progression, memberId);
  const { vigor, power, precision, will } = hero.attributes;
  const physical = memberId === 'matthias' || memberId === 'rook';
  const rangedOrMagic = memberId === 'bishop' || memberId === 'knight';
  const skillModifiers = skillModifiersFor(hero, memberId);
  const profileOverrides = skillProfileOverridesFor(hero, memberId);
  const attackDamageBonus = (physical ? Math.floor(power / 2) : Math.floor(precision / 3)) + Number(skillModifiers.attackDamageBonus || 0);
  const reachBonus = (rangedOrMagic ? Math.floor(precision / 2) : 0) + Number(skillModifiers.reachBonus || 0);
  const abilityPotencyBonus = (physical ? Math.floor(power / 2) : Math.floor(precision / 3))
    + Math.floor(will / 2)
    + Number(skillModifiers.abilityPotencyBonus || 0);
  return {
    bonusMaxHp: vigor + Number(skillModifiers.bonusMaxHp || 0),
    attackDamageBonus,
    reachBonus,
    abilityPotencyBonus,
    abilityCharges: 1 + (will >= 3 ? 1 : 0) + Number(skillModifiers.abilityCharges || 0),
    profileOverrides,
  };
}

export function applyChroniclesProgressionToTacticsState(state, progression) {
  const classAbilityCharges = {};
  const rpgModifiers = {};
  const party = (state.party || []).map((member) => {
    const modifiers = chroniclesTacticsModifiers(progression, member.id);
    rpgModifiers[member.id] = modifiers;
    classAbilityCharges[member.id] = modifiers.abilityCharges;
    const baseMaxHp = Math.max(1, nonNegativeInteger(member.maxHp, 1));
    const baseHp = Math.max(0, nonNegativeInteger(member.hp));
    const maxHp = baseMaxHp + modifiers.bonusMaxHp;
    return {
      ...member,
      maxHp,
      hp: Math.min(maxHp, baseHp + modifiers.bonusMaxHp),
    };
  });
  return {
    ...state,
    party,
    classAbilityCharges,
    rpgModifiers,
  };
}

function skillPointsEarnedBetween(fromLevel, toLevel) {
  let points = 0;
  for (let level = fromLevel + 1; level <= toLevel; level += 1) {
    if (level % 2 === 0) points += 1;
  }
  return points;
}

export function grantChroniclesXp(progression, memberId, amount, awardId) {
  const current = normalizeChroniclesProgression(progression);
  const safeAwardId = String(awardId || '').trim();
  const requested = nonNegativeInteger(amount);
  if (!HERO_IDS.includes(memberId) || !safeAwardId || requested <= 0) {
    return { progression: current, awarded: 0, duplicate: false, levelUps: [] };
  }
  if (current.claimedAwards.includes(safeAwardId)) {
    return { progression: current, awarded: 0, duplicate: true, levelUps: [] };
  }

  const hero = current.heroes[memberId];
  const maxXp = chroniclesXpThresholdForLevel(CHRONICLES_MAX_LEVEL);
  const nextXp = Math.min(maxXp, hero.xp + requested);
  const nextLevel = chroniclesLevelForXp(nextXp);
  const levelsGained = Math.max(0, nextLevel - hero.level);
  const awarded = Math.max(0, nextXp - hero.xp);
  const nextHero = {
    ...hero,
    xp: nextXp,
    level: nextLevel,
    attributePoints: hero.attributePoints + levelsGained,
    skillPoints: hero.skillPoints + skillPointsEarnedBetween(hero.level, nextLevel),
  };
  const next = {
    ...current,
    heroes: { ...current.heroes, [memberId]: nextHero },
    claimedAwards: [...current.claimedAwards, safeAwardId].slice(-CLAIM_LIMIT),
  };
  const levelUps = levelsGained > 0 ? [{ memberId, from: hero.level, to: nextLevel }] : [];
  return { progression: next, awarded, duplicate: false, levelUps };
}

function currentOwner() {
  return String(getStorageItem(STORAGE_LOCAL, AUTH_USERNAME_KEY) || '').trim().toLowerCase();
}

function createRunId() {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  } catch {
    // Fall through to a compact non-cryptographic id; uniqueness is enough here.
  }
  return `chronicles-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function readRunState() {
  try {
    const raw = getStorageItem(STORAGE_LOCAL, CHRONICLES_TACTICS_RUN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.id !== 'string' || !parsed.id.trim()) return null;
    const owner = String(parsed.owner || '').trim().toLowerCase();
    if (owner !== currentOwner()) return null;
    return { id: parsed.id.trim(), owner, ended: Boolean(parsed.ended) };
  } catch {
    return null;
  }
}

export function beginChroniclesTacticsRun() {
  const run = { id: createRunId(), owner: currentOwner(), ended: false };
  setStorageItem(STORAGE_LOCAL, CHRONICLES_TACTICS_RUN_STORAGE_KEY, JSON.stringify(run));
  return run.id;
}

export function ensureChroniclesTacticsRun() {
  const current = readRunState();
  if (current && !current.ended) return current.id;
  return beginChroniclesTacticsRun();
}

export function finishChroniclesTacticsRun(runId) {
  const current = readRunState();
  if (!current || current.id !== runId) return false;
  setStorageItem(STORAGE_LOCAL, CHRONICLES_TACTICS_RUN_STORAGE_KEY, JSON.stringify({ ...current, ended: true }));
  return true;
}

function enemyHp(state, enemy) {
  return Math.max(0, nonNegativeInteger(state?.[enemy.hpKey]));
}

function progressionNamespace(state) {
  const map = chroniclesMapForState(state);
  return String(map.progressionKey || map.id || 'chronicles').trim() || 'chronicles';
}

function award(progress, awards, levelUps, memberId, amount, awardId, reason) {
  const result = grantChroniclesXp(progress, memberId, amount, awardId);
  if (result.awarded > 0) awards.push({ memberId, xp: result.awarded, reason, awardId });
  if (result.levelUps.length) levelUps.push(...result.levelUps);
  return result.progression;
}

function awardDamageBudget(progress, awards, levelUps, memberId, enemy, before, after, namespace) {
  let next = progress;
  for (let hp = before - 1; hp >= after; hp -= 1) {
    next = award(
      next,
      awards,
      levelUps,
      memberId,
      2,
      `${namespace}:damage:${enemy.id}:hp-${hp}`,
      'daño útil',
    );
  }
  return next;
}

function awardHealingBudget(progress, awards, levelUps, memberId, targetId, before, after, namespace) {
  let next = progress;
  for (let hp = before + 1; hp <= after; hp += 1) {
    next = award(
      next,
      awards,
      levelUps,
      memberId,
      2,
      `${namespace}:support:${targetId}:hp-${hp}`,
      'soporte efectivo',
    );
  }
  return next;
}

export function applyChroniclesTacticsProgression(progression, previous, next, {
  actorMemberId = null,
  actionKind = 'action',
  runId,
} = {}) {
  let progress = normalizeChroniclesProgression(progression);
  const awards = [];
  const levelUps = [];
  const safeRunId = String(runId || '').trim();
  if (!previous || !next || !safeRunId) return { progression: progress, awards, levelUps };

  const map = chroniclesMapForState(previous);
  const namespace = `${safeRunId}:${progressionNamespace(previous)}`;

  if (actorMemberId && HERO_IDS.includes(actorMemberId)) {
    map.enemies.forEach((enemy) => {
      const before = enemyHp(previous, enemy);
      const after = enemyHp(next, enemy);
      if (after >= before) return;
      progress = awardDamageBudget(progress, awards, levelUps, actorMemberId, enemy, before, after, namespace);
      if (before > 0 && after === 0) {
        progress = award(
          progress,
          awards,
          levelUps,
          actorMemberId,
          10 + Math.max(1, nonNegativeInteger(enemy.maxHp)) * 2,
          `${namespace}:kill:${enemy.id}`,
          'baja',
        );
      }
    });

    if (actionKind === 'ability') {
      const beforeParty = new Map((previous.party || []).map((member) => [member.id, member]));
      (next.party || []).forEach((member) => {
        const before = beforeParty.get(member.id);
        if (!before || member.hp <= before.hp) return;
        progress = awardHealingBudget(progress, awards, levelUps, actorMemberId, member.id, before.hp, member.hp, namespace);
      });
    }

    if (!previous.sigilAwake && next.sigilAwake) {
      progress = award(
        progress,
        awards,
        levelUps,
        actorMemberId,
        8,
        `${namespace}:objective:sigil`,
        'objetivo',
      );
    }
  }

  if (previous.phase !== 'escaped' && next.phase === 'escaped') {
    (next.party || []).filter((member) => member.hp > 0 && HERO_IDS.includes(member.id)).forEach((member) => {
      progress = award(
        progress,
        awards,
        levelUps,
        member.id,
        12,
        `${namespace}:survival:${member.id}`,
        'supervivencia',
      );
    });
  }

  return { progression: progress, awards, levelUps };
}
