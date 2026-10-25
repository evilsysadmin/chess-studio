import { STORAGE_SESSION, readJsonStorage, removeStorageItem, setStorageItem } from './safeStorage.js';

// Ephemeral per-tab recovery for an unsent support message, never server
// authority. Screenshots remain File objects in the open modal and cannot be
// promised to survive reload; never serialize base64 images to Web Storage.
export const FEEDBACK_DRAFT_KEY = 'chess-study-feedback-draft-v1';
const CATEGORIES = new Set(['general', 'ux', 'bug', 'idea', 'other']);

function normalizeOwner(owner) {
  return String(owner || '').trim().toLowerCase();
}

export function readFeedbackDraft({ owner, context = 'Home' } = {}) {
  const identity = normalizeOwner(owner);
  if (!identity) return null;
  const entry = readJsonStorage(STORAGE_SESSION, FEEDBACK_DRAFT_KEY);
  if (!entry || entry.version !== 1 || entry.owner !== identity || entry.context !== context) return null;
  if (!CATEGORIES.has(entry.category) || typeof entry.message !== 'string'
    || entry.message.length > 2000 || !entry.message.trim()) return null;
  return { category: entry.category, message: entry.message };
}

export function saveFeedbackDraft({ owner, context = 'Home', category = 'general', message = '' } = {}) {
  const identity = normalizeOwner(owner);
  if (!identity || !CATEGORIES.has(category) || typeof message !== 'string') return false;
  if (!message.trim()) {
    removeStorageItem(STORAGE_SESSION, FEEDBACK_DRAFT_KEY);
    return false;
  }
  return setStorageItem(STORAGE_SESSION, FEEDBACK_DRAFT_KEY, JSON.stringify({
    version: 1,
    owner: identity,
    context,
    category,
    message: message.slice(0, 2000),
  }));
}

export function clearFeedbackDraft() {
  return removeStorageItem(STORAGE_SESSION, FEEDBACK_DRAFT_KEY);
}
