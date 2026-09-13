import { getUsername } from './auth.js';
import { STORAGE_SESSION, readJsonStorage, removeStorageItem, writeJsonStorage } from './safeStorage.js';

export const GUIDED_TRAINING_COMPLETION_KEY = 'chess-study-guided-training-completion-v1';
const COMPLETION_SCHEMA = 1;
const MAX_COMPLETION_AGE_MS = 24 * 60 * 60 * 1000;

function completionOwner() {
  return String(getUsername() || '').trim().toLowerCase() || null;
}

function normalizeMinutes(value) {
  const minutes = Number(value);
  if (minutes === 5 || minutes === 30) return minutes;
  return 15;
}

function normalizeBlock(step, index) {
  if (!step || step.kind === 'review') return null;
  const title = String(step.title || '').trim();
  if (!title) return null;
  return {
    id: String(step.id || `block-${index + 1}`),
    kind: String(step.kind || 'practice'),
    title,
    minutes: Math.max(0, Math.round(Number(step.minutes || 0))),
  };
}

function normalizeCompletion(value, now = Date.now()) {
  if (!value || value.schema !== COMPLETION_SCHEMA || !Array.isArray(value.blocks)) return null;
  if ((value.owner || null) !== completionOwner()) return null;
  const completedAt = Number(value.completedAt || 0);
  if (!completedAt || now - completedAt > MAX_COMPLETION_AGE_MS || completedAt - now > 60_000) return null;
  const blocks = value.blocks.map(normalizeBlock).filter(Boolean);
  if (!blocks.length) return null;
  return {
    schema: COMPLETION_SCHEMA,
    owner: value.owner || null,
    completedAt,
    minutes: normalizeMinutes(value.minutes),
    blocks,
  };
}

export function saveGuidedTrainingCompletion(session, { now = Date.now() } = {}) {
  if (!session || !Array.isArray(session.steps) || !session.steps.length) return null;
  const currentIndex = Math.max(0, Math.floor(Number(session.currentIndex) || 0));
  if (currentIndex < session.steps.length - 1) return null;
  const blocks = session.steps.map(normalizeBlock).filter(Boolean);
  if (!blocks.length) return null;

  const completion = {
    schema: COMPLETION_SCHEMA,
    owner: completionOwner(),
    completedAt: Number(now),
    minutes: normalizeMinutes(session.minutes),
    blocks,
  };
  writeJsonStorage(STORAGE_SESSION, GUIDED_TRAINING_COMPLETION_KEY, completion);
  return normalizeCompletion(completion, Number(now));
}

export function loadGuidedTrainingCompletion({ now = Date.now() } = {}) {
  const parsed = readJsonStorage(STORAGE_SESSION, GUIDED_TRAINING_COMPLETION_KEY, { fallback: null });
  const normalized = normalizeCompletion(parsed, Number(now));
  if (!normalized) removeStorageItem(STORAGE_SESSION, GUIDED_TRAINING_COMPLETION_KEY);
  return normalized;
}

export function clearGuidedTrainingCompletion() {
  removeStorageItem(STORAGE_SESSION, GUIDED_TRAINING_COMPLETION_KEY);
}
