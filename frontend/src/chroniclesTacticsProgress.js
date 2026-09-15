import { STORAGE_LOCAL, getStorageItem } from './safeStorage.js';
import { setProfileStorageItem } from './profileKeys.js';

export const CHRONICLES_TACTICS_PROGRESS_KEY = 'chess-study-chronicles-tactics-progress-v1';
export const CHRONICLES_TACTICS_PROGRESS_VERSION = 1;

const HERO_IDS = Object.freeze(['matthias', 'rook', 'bishop', 'knight']);
const MAX_LEDGER_EVENTS = 256;
const MAX_XP_PER_AWARD = 25;

function emptyHeroes() {
  return Object.fromEntries(HERO_IDS.map((id) => [id, { xp: 0 }]));
}

export function createChroniclesTacticsProgress() {
  return {
    version: CHRONICLES_TACTICS_PROGRESS_VERSION,
    heroes: emptyHeroes(),
    awardedEventIds: [],
  };
}

function normalizeXp(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.floor(number));
}

export function normalizeChroniclesTacticsProgress(value) {
  const base = createChroniclesTacticsProgress();
  if (!value || typeof value !== 'object') return base;

  HERO_IDS.forEach((id) => {
    base.heroes[id].xp = normalizeXp(value.heroes?.[id]?.xp);
  });

  if (Array.isArray(value.awardedEventIds)) {
    base.awardedEventIds = [...new Set(value.awardedEventIds
      .filter((id) => typeof id === 'string' && id.length > 0)
      .slice(-MAX_LEDGER_EVENTS))];
  }
  return base;
}

export function loadChroniclesTacticsProgress() {
  const raw = getStorageItem(STORAGE_LOCAL, CHRONICLES_TACTICS_PROGRESS_KEY);
  if (!raw) return createChroniclesTacticsProgress();
  try {
    return normalizeChroniclesTacticsProgress(JSON.parse(raw));
  } catch {
    return createChroniclesTacticsProgress();
  }
}

export function applyChroniclesXpAwards(progress, awards) {
  const next = normalizeChroniclesTacticsProgress(progress);
  const awarded = new Set(next.awardedEventIds);
  const applied = [];

  (Array.isArray(awards) ? awards : []).forEach((award) => {
    const id = typeof award?.id === 'string' ? award.id : '';
    const heroId = typeof award?.heroId === 'string' ? award.heroId : '';
    const amount = Math.min(MAX_XP_PER_AWARD, normalizeXp(award?.amount));
    if (!id || !HERO_IDS.includes(heroId) || amount <= 0 || awarded.has(id)) return;

    next.heroes[heroId].xp += amount;
    awarded.add(id);
    applied.push({ id, heroId, amount, reason: String(award?.reason || '') });
  });

  next.awardedEventIds = [...awarded].slice(-MAX_LEDGER_EVENTS);
  return { progress: next, applied };
}

export function persistChroniclesXpAwards(awards) {
  const current = loadChroniclesTacticsProgress();
  const result = applyChroniclesXpAwards(current, awards);
  if (result.applied.length > 0) {
    setProfileStorageItem(CHRONICLES_TACTICS_PROGRESS_KEY, JSON.stringify(result.progress));
  }
  return result;
}
