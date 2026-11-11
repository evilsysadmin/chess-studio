import { getUsername } from './auth.js';
import { STORAGE_SESSION, readJsonStorage, removeStorageItem, writeJsonStorage } from './safeStorage.js';

export const GUIDED_TRAINING_COMPLETION_KEY = 'chess-study-guided-training-completion-v1';
const COMPLETION_SCHEMA = 1;
const MAX_COMPLETION_AGE_MS = 24 * 60 * 60 * 1000;

function completionOwner() {
  return String(getUsername() || '').trim().toLowerCase() || null;
}

const VALID_DURATIONS = new Set([5, 15, 30]);

function normalizeBlock(step, index) {
  if (!step || step.kind === 'review') return null;
  const title = String(step.title || '').trim();
  // Stored minutes are measured plan allocations, not values to guess.
  if (!title || !Number.isFinite(step.minutes) || step.minutes <= 0 || step.minutes > 30) return null;
  return {
    id: String(step.id || `block-${index + 1}`),
    kind: String(step.kind || 'practice'),
    title,
    minutes: Math.round(step.minutes),
  };
}

function normalizeCompletion(value, now = Date.now()) {
  if (!value || value.schema !== COMPLETION_SCHEMA || !Array.isArray(value.blocks)
    || !VALID_DURATIONS.has(value.minutes)) return null;
  if ((value.owner || null) !== completionOwner()) return null;
  const completedAt = Number(value.completedAt || 0);
  if (!completedAt || now - completedAt > MAX_COMPLETION_AGE_MS || completedAt - now > 60_000) return null;
  const blocks = value.blocks.map(normalizeBlock);
  if (!blocks.length || blocks.some((block) => !block || block.minutes > value.minutes)) return null;
  return {
    schema: COMPLETION_SCHEMA,
    owner: value.owner || null,
    completedAt,
    minutes: value.minutes,
    blocks,
  };
}

export function saveGuidedTrainingCompletion(session, { now = Date.now() } = {}) {
  if (!session || !Array.isArray(session.steps) || !session.steps.length
    || !VALID_DURATIONS.has(session.minutes)) return null;
  // Only the exact last step proves that the user closed this itinerary.
  // Flooring/clamping a corrupt cursor could invent a completed session.
  if (!Number.isInteger(session.currentIndex)
    || session.currentIndex !== session.steps.length - 1) return null;
  const normalizedSteps = session.steps.map(normalizeBlock);
  // Review is intentionally omitted; a damaged practice block is not.
  if (normalizedSteps.some((block, index) => !block && session.steps[index]?.kind !== 'review')) return null;
  const blocks = normalizedSteps.filter(Boolean);
  if (!blocks.length || blocks.some((block) => block.minutes > session.minutes)) return null;

  const completion = {
    schema: COMPLETION_SCHEMA,
    owner: completionOwner(),
    completedAt: Number(now),
    minutes: session.minutes,
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
