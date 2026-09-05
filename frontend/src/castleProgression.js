import { STORAGE_LOCAL, getStorageItem } from './safeStorage.js';
import { setProfileStorageItem } from './profileKeys.js';

export const CASTLE_UNLOCKS_KEY = 'chess-study-castle-unlocks-v1';
export const CASTLE_UNLOCK_LEDGER_VERSION = 1;
export const MAX_CASTLE_DISPLAY_OBJECTS = 3;

export const CASTLE_OBJECT_CATALOG = Object.freeze([
  { achievementId: 'rating_master', family: 'rating', objectId: 'master-crown', label: 'Corona del Maestro', glyph: '♚', tone: 'brass', form: 'crown', prestige: 100, rarity: 'legendary' },
  { achievementId: 'rivalry_hard_75', family: 'rivalry', objectId: 'giantslayer-helm', label: 'Yelmo del Tumbagigantes', glyph: '♞', tone: 'steel', form: 'helm', prestige: 94, rarity: 'legendary' },
  { achievementId: 'tournament_level_10', family: 'tournament', objectId: 'imperial-cup', label: 'Copa imperial', glyph: '♛', tone: 'brass', form: 'cup', prestige: 90, rarity: 'legendary' },
  { achievementId: 'combat_flawless', family: 'combat-flawless', objectId: 'flawless-standard', label: 'Estandarte intacto', glyph: '⚑', tone: 'ember', form: 'standard', prestige: 88, rarity: 'epic' },
  { achievementId: 'feat_pawn_queen', family: 'tactic-pawn-queen', objectId: 'golden-pawn', label: 'Peón de oro', glyph: '♟', tone: 'brass', form: 'pawn', prestige: 86, rarity: 'epic' },
  { achievementId: 'rating_advanced', family: 'rating', objectId: 'officer-blade', label: 'Espada de oficial', glyph: '⚔︎', tone: 'steel', form: 'blade', prestige: 84, rarity: 'epic' },
  { achievementId: 'combat_gold_piece', family: 'combat-veteran', objectId: 'veteran-reliquary', label: 'Relicario del veterano', glyph: '♜', tone: 'ember', form: 'reliquary', prestige: 80, rarity: 'epic' },
  { achievementId: 'feat_skewer', family: 'tactic-skewer', objectId: 'royal-halberd', label: 'Alabarda real', glyph: '†', tone: 'steel', form: 'halberd', prestige: 78, rarity: 'rare' },
  { achievementId: 'rivalry_streak_3', family: 'rivalry', objectId: 'three-in-row-plaque', label: 'Placa de tres al hilo', glyph: 'III', tone: 'steel', form: 'plaque', prestige: 74, rarity: 'rare' },
  { achievementId: 'feat_mate', family: 'tactic-mate', objectId: 'fallen-king', label: 'Rey derribado', glyph: '♚', tone: 'brass', form: 'fallen-king', prestige: 72, rarity: 'rare' },
  { achievementId: 'feat_promotion', family: 'tactic-promotion', objectId: 'promotion-crown', label: 'Corona de ascenso', glyph: '♕', tone: 'brass', form: 'crown', prestige: 68, rarity: 'rare' },
  { achievementId: 'tournament_level_5', family: 'tournament', objectId: 'officer-cup', label: 'Copa de oficial', glyph: '♛', tone: 'brass', form: 'cup', prestige: 64, rarity: 'rare' },
  { achievementId: 'daily_clean_full_3', family: 'daily-discipline', objectId: 'clean-seal', label: 'Sello impecable', glyph: '✦', tone: 'parchment', form: 'seal', prestige: 60, rarity: 'uncommon' },
  { achievementId: 'puzzles_50', family: 'puzzles', objectId: 'tactics-volume', label: 'Tratado de táctica', glyph: '▤', tone: 'parchment', form: 'book', prestige: 58, rarity: 'uncommon' },
  { achievementId: 'rating_intermediate', family: 'rating', objectId: 'academy-blade', label: 'Hoja de academia', glyph: '⚔︎', tone: 'steel', form: 'blade', prestige: 56, rarity: 'uncommon' },
]);

const CATALOG_BY_OBJECT = new Map(CASTLE_OBJECT_CATALOG.map((entry) => [entry.objectId, entry]));
const CATALOG_BY_ACHIEVEMENT = new Map(CASTLE_OBJECT_CATALOG.map((entry) => [entry.achievementId, entry]));
const EVIDENCE_STRING_KEYS = Object.freeze(['gameId', 'battleId', 'mode', 'opponent', 'color', 'opening', 'eventType', 'actor']);
const EVIDENCE_NUMBER_KEYS = Object.freeze(['difficulty', 'ply']);

function normalizedIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function sanitizeEvidence(record) {
  const provenance = record?.provenance && typeof record.provenance === 'object' ? record.provenance : {};
  const evidence = {
    legacy: record?.legacy === true,
    source: typeof record?.source === 'string' && record.source.trim() ? record.source.trim().slice(0, 80) : 'achievement',
  };
  for (const key of EVIDENCE_STRING_KEYS) {
    if (typeof provenance[key] === 'string' && provenance[key].trim()) evidence[key] = provenance[key].trim().slice(0, 160);
  }
  for (const key of EVIDENCE_NUMBER_KEYS) {
    const value = Number(provenance[key]);
    if (Number.isFinite(value)) evidence[key] = value;
  }
  const occurredAt = normalizedIso(provenance.occurredAt);
  if (occurredAt) evidence.occurredAt = occurredAt;
  return evidence;
}

function cleanUnlock(objectId, value) {
  const catalog = CATALOG_BY_OBJECT.get(objectId);
  if (!catalog || !value || typeof value !== 'object') return null;
  const sourceId = typeof value.sourceId === 'string' ? value.sourceId.trim().slice(0, 120) : '';
  if (sourceId !== catalog.achievementId) return null;
  const sourceType = value.sourceType === 'achievement-legacy' ? 'achievement-legacy' : 'achievement';
  const evidence = sanitizeEvidence({
    source: value.evidence?.source,
    legacy: sourceType === 'achievement-legacy' || value.evidence?.legacy === true,
    provenance: value.evidence,
  });
  return {
    objectId,
    version: CASTLE_UNLOCK_LEDGER_VERSION,
    earnedAt: sourceType === 'achievement-legacy' ? null : normalizedIso(value.earnedAt),
    sourceType,
    sourceId,
    evidence,
  };
}

export function emptyCastleUnlockLedger() {
  return { version: CASTLE_UNLOCK_LEDGER_VERSION, records: {} };
}

export function loadCastleUnlockLedger() {
  try {
    const raw = getStorageItem(STORAGE_LOCAL, CASTLE_UNLOCKS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || parsed.version !== CASTLE_UNLOCK_LEDGER_VERSION || !parsed.records || typeof parsed.records !== 'object') {
      return emptyCastleUnlockLedger();
    }
    const records = {};
    for (const [objectId, value] of Object.entries(parsed.records)) {
      const clean = cleanUnlock(objectId, value);
      if (clean) records[objectId] = clean;
    }
    return { version: CASTLE_UNLOCK_LEDGER_VERSION, records };
  } catch {
    return emptyCastleUnlockLedger();
  }
}

function achievementIdSet(value) {
  return value instanceof Set ? value : new Set(Array.isArray(value) ? value : []);
}

export function reconcileCastleUnlocks(existingLedger, achievementIds, achievementLedger) {
  const existing = existingLedger?.records && typeof existingLedger.records === 'object'
    ? existingLedger
    : emptyCastleUnlockLedger();
  const unlocked = achievementIdSet(achievementIds);
  const records = {};
  for (const [objectId, raw] of Object.entries(existing.records)) {
    const clean = cleanUnlock(objectId, raw);
    if (clean) records[objectId] = clean;
  }

  for (const achievementId of unlocked) {
    const catalog = CATALOG_BY_ACHIEVEMENT.get(achievementId);
    if (!catalog || records[catalog.objectId]) continue;
    const record = achievementLedger?.records?.[achievementId] || null;
    const legacy = !record || record.legacy === true;
    records[catalog.objectId] = {
      objectId: catalog.objectId,
      version: CASTLE_UNLOCK_LEDGER_VERSION,
      earnedAt: legacy ? null : normalizedIso(record.recordedAt),
      sourceType: legacy ? 'achievement-legacy' : 'achievement',
      sourceId: achievementId,
      evidence: sanitizeEvidence(record || { source: 'legacy', legacy: true, provenance: {} }),
    };
  }

  return { version: CASTLE_UNLOCK_LEDGER_VERSION, records };
}

export function castleLedgerFingerprint(ledger) {
  const records = ledger?.records && typeof ledger.records === 'object' ? ledger.records : {};
  return JSON.stringify(Object.keys(records).sort().map((id) => {
    const row = records[id];
    return [id, row?.earnedAt || null, row?.sourceType || '', row?.sourceId || ''];
  }));
}

export function persistCastleUnlockLedger(ledger) {
  const records = {};
  for (const [objectId, raw] of Object.entries(ledger?.records || {})) {
    const clean = cleanUnlock(objectId, raw);
    if (clean) records[objectId] = clean;
  }
  return setProfileStorageItem(CASTLE_UNLOCKS_KEY, JSON.stringify({ version: CASTLE_UNLOCK_LEDGER_VERSION, records }));
}

export function castleHonourObjects(ledger, achievementDescriptions = {}) {
  const strongestByFamily = new Map();
  for (const raw of Object.values(ledger?.records || {})) {
    const unlock = cleanUnlock(raw?.objectId, raw);
    if (!unlock) continue;
    const catalog = CATALOG_BY_OBJECT.get(unlock.objectId);
    const current = strongestByFamily.get(catalog.family);
    if (!current || catalog.prestige > current.prestige) {
      strongestByFamily.set(catalog.family, { catalog, unlock });
    }
  }
  return [...strongestByFamily.values()]
    .map(({ catalog, unlock }) => ({
      id: catalog.objectId,
      objectId: catalog.objectId,
      achievementId: catalog.achievementId,
      family: catalog.family,
      label: catalog.label,
      glyph: catalog.glyph,
      tone: catalog.tone,
      form: catalog.form,
      prestige: catalog.prestige,
      rarity: catalog.rarity,
      kind: 'honour',
      detail: achievementDescriptions[catalog.achievementId] || 'Mérito acreditado en tu historial.',
      evidence: unlock.sourceType === 'achievement-legacy' ? 'legacy' : 'recorded',
      earnedAt: unlock.earnedAt,
      sourceType: unlock.sourceType,
      sourceId: unlock.sourceId,
    }))
    .sort((a, b) => b.prestige - a.prestige || a.id.localeCompare(b.id));
}

export function castleUnlockSummary(ledger) {
  const all = Object.values(ledger?.records || {}).map((record) => cleanUnlock(record?.objectId, record)).filter(Boolean);
  return {
    total: all.length,
    recorded: all.filter((record) => record.sourceType === 'achievement').length,
    legacy: all.filter((record) => record.sourceType === 'achievement-legacy').length,
  };
}
