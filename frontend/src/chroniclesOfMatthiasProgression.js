import { CHRONICLES_ENEMIES } from './chroniclesOfMatthias.js';
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

const AUTH_USERNAME_KEY = 'chess-study-auth-username';
const ENCOUNTER_ID = 'crypt-01';
const HERO_IDS = Object.freeze(['matthias', 'rook', 'bishop', 'knight']);
const CLAIM_LIMIT = 256;
const ATTRIBUTE_KEYS = Object.freeze(['vigor', 'power', 'precision', 'will']);

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
    result[key] = Math.min(20, nonNegativeInteger(source[key]));
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

function award(progress, awards, levelUps, memberId, amount, awardId, reason) {
  const result = grantChroniclesXp(progress, memberId, amount, awardId);
  if (result.awarded > 0) awards.push({ memberId, xp: result.awarded, reason, awardId });
  if (result.levelUps.length) levelUps.push(...result.levelUps);
  return result.progression;
}

function awardDamageBudget(progress, awards, levelUps, memberId, enemy, before, after) {
  let next = progress;
  for (let hp = before - 1; hp >= after; hp -= 1) {
    next = award(
      next,
      awards,
      levelUps,
      memberId,
      2,
      `${ENCOUNTER_ID}:damage:${enemy.id}:hp-${hp}`,
      'daño útil',
    );
  }
  return next;
}

function awardHealingBudget(progress, awards, levelUps, memberId, targetId, before, after) {
  let next = progress;
  for (let hp = before + 1; hp <= after; hp += 1) {
    next = award(
      next,
      awards,
      levelUps,
      memberId,
      2,
      `${ENCOUNTER_ID}:support:${targetId}:hp-${hp}`,
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

  if (actorMemberId && HERO_IDS.includes(actorMemberId)) {
    CHRONICLES_ENEMIES.forEach((enemy) => {
      const before = enemyHp(previous, enemy);
      const after = enemyHp(next, enemy);
      if (after >= before) return;
      progress = awardDamageBudget(progress, awards, levelUps, actorMemberId, enemy, before, after);
      if (before > 0 && after === 0) {
        progress = award(
          progress,
          awards,
          levelUps,
          actorMemberId,
          10 + Math.max(1, nonNegativeInteger(enemy.maxHp)) * 2,
          `${ENCOUNTER_ID}:kill:${enemy.id}`,
          'baja',
        );
      }
    });

    if (actionKind === 'ability') {
      const beforeParty = new Map((previous.party || []).map((member) => [member.id, member]));
      (next.party || []).forEach((member) => {
        const before = beforeParty.get(member.id);
        if (!before || member.hp <= before.hp) return;
        progress = awardHealingBudget(progress, awards, levelUps, actorMemberId, member.id, before.hp, member.hp);
      });
    }

    if (!previous.sigilAwake && next.sigilAwake) {
      progress = award(
        progress,
        awards,
        levelUps,
        actorMemberId,
        8,
        `${ENCOUNTER_ID}:objective:sigil`,
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
        `${ENCOUNTER_ID}:survival:${member.id}`,
        'supervivencia',
      );
    });
  }

  return { progression: progress, awards, levelUps };
}
