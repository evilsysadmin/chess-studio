import {
  STORAGE_LOCAL,
  STORAGE_SESSION,
  getStorageItem,
  readJsonStorage,
  removeStorageItem,
  writeJsonStorage,
} from '../safeStorage.js';
import {
  CHRONICLES_CHARACTER_SLOTS,
  normalizeChroniclesCharacterBuild,
} from './chroniclesCharacterBuilds.js';

export const CHRONICLES_CHARACTER_DRAFT_VERSION = 1;
const AUTH_USERNAME_KEY = 'chess-study-auth-username';
const DRAFT_KEY_PREFIX = 'chess-study-chronicles-character-draft-v1';

function currentOwner() {
  return String(getStorageItem(STORAGE_LOCAL, AUTH_USERNAME_KEY) || '').trim().toLocaleLowerCase('es');
}

function storageKey(owner) {
  return `${DRAFT_KEY_PREFIX}:${encodeURIComponent(owner)}`;
}

function normalizedActiveSlot(value) {
  return CHRONICLES_CHARACTER_SLOTS.includes(value) ? value : CHRONICLES_CHARACTER_SLOTS[0];
}

export function loadChroniclesCharacterDraft(partyTemplates) {
  const owner = currentOwner();
  if (!owner) return null;

  const raw = readJsonStorage(STORAGE_SESSION, storageKey(owner), {
    fallback: null,
    removeMalformed: true,
  });
  if (!raw || raw.version !== CHRONICLES_CHARACTER_DRAFT_VERSION || raw.owner !== owner) return null;

  const build = normalizeChroniclesCharacterBuild(raw.build, partyTemplates);
  if (build.mode !== 'custom') return null;

  return {
    version: CHRONICLES_CHARACTER_DRAFT_VERSION,
    seed: String(raw.seed ?? build.seed ?? '').slice(0, 48),
    activeSlot: normalizedActiveSlot(raw.activeSlot),
    build,
  };
}

export function saveChroniclesCharacterDraft({
  seed = '',
  activeSlot = CHRONICLES_CHARACTER_SLOTS[0],
  build,
} = {}, partyTemplates) {
  const owner = currentOwner();
  if (!owner) return false;

  const normalizedBuild = normalizeChroniclesCharacterBuild(build, partyTemplates);
  if (normalizedBuild.mode !== 'custom') return false;

  return writeJsonStorage(STORAGE_SESSION, storageKey(owner), {
    version: CHRONICLES_CHARACTER_DRAFT_VERSION,
    owner,
    seed: String(seed ?? normalizedBuild.seed ?? '').slice(0, 48),
    activeSlot: normalizedActiveSlot(activeSlot),
    build: normalizedBuild,
  });
}

export function clearChroniclesCharacterDraft() {
  const owner = currentOwner();
  if (!owner) return false;
  return removeStorageItem(STORAGE_SESSION, storageKey(owner));
}
