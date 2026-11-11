import { STORAGE_SESSION, readJsonStorage, removeStorageItem, writeJsonStorage } from './safeStorage.js';
import { getUsername } from './auth.js';
import { GUIDED_TRAINING_SESSION_KEY, GUIDED_TRAINING_MINUTES } from './guidedTrainingOriginReader.js';
export { GUIDED_TRAINING_SESSION_KEY } from './guidedTrainingOriginReader.js';

// Lightweight persisted-session contract. Game start/exit must not eagerly
// bundle Player Model, puzzle planning and their analysis dependencies.
const SESSION_SCHEMA = 1;
const MAX_SESSION_AGE_MS = 4 * 60 * 60 * 1000;

function sessionOwner() {
  return String(getUsername() || '').trim().toLowerCase() || null;
}

export function normalizeDuration(value) {
  const minutes = Number(value);
  if (GUIDED_TRAINING_MINUTES.includes(minutes)) return minutes;
  return 5;
}

const GUIDED_ACTIONS = new Set(['personal', 'personal-filter', 'nemesis-position', 'short-game', 'review']);

function validSessionStep(step) {
  if (!step || typeof step !== 'object' || Array.isArray(step)) return false;
  if (typeof step.id !== 'string' || !step.id.trim()) return false;
  if (typeof step.title !== 'string' || !step.title.trim()) return false;
  if (!GUIDED_ACTIONS.has(step.action)) return false;
  if (typeof step.minutes !== 'number' || !Number.isFinite(step.minutes) || step.minutes <= 0) return false;
  if (step.action === 'nemesis-position' || step.action === 'short-game') {
    const training = step.training;
    if (!training || typeof training !== 'object' || Array.isArray(training)) return false;
    if (typeof training.fen !== 'string' || !training.fen.trim()) return false;
    if (training.humanColor !== 'w' && training.humanColor !== 'b') return false;
    if (!Number.isFinite(training.difficulty) || training.difficulty < 0 || training.difficulty > 100) return false;
  }
  return true;
}

function validSessionSteps(steps) {
  return Array.isArray(steps) && steps.length > 0 && steps.every(validSessionStep);
}

function normalizeStoredSession(value, now = Date.now()) {
  // A missing identity or an invalid budget cannot be reconstructed from a
  // fallback: doing so changes what the player sees after F5.
  if (!value || value.schema !== SESSION_SCHEMA || !validSessionSteps(value.steps)
    || typeof value.id !== 'string' || !value.id.trim()
    || !GUIDED_TRAINING_MINUTES.includes(value.minutes)) return null;
  if ((value.owner || null) !== sessionOwner()) return null;
  const startedAt = Number(value.startedAt || 0);
  if (!startedAt || now - startedAt > MAX_SESSION_AGE_MS || startedAt - now > 60_000) return null;
  // A corrupted cursor must not silently turn into a different assignment
  // after F5 (especially the review/final step). Preserve only exact positions.
  if (!Number.isInteger(value.currentIndex) || value.currentIndex < 0
    || value.currentIndex >= value.steps.length) return null;
  const currentIndex = value.currentIndex;
  return {
    schema: SESSION_SCHEMA,
    id: value.id,
    owner: value.owner || null,
    minutes: value.minutes,
    startedAt,
    currentIndex,
    steps: value.steps,
  };
}

export function loadGuidedTrainingSession({ now = Date.now() } = {}) {
  const parsed = readJsonStorage(STORAGE_SESSION, GUIDED_TRAINING_SESSION_KEY, { fallback: null });
  const normalized = normalizeStoredSession(parsed, Number(now));
  if (!normalized) removeStorageItem(STORAGE_SESSION, GUIDED_TRAINING_SESSION_KEY);
  return normalized;
}

export function startGuidedTrainingSession(plan, { now = Date.now() } = {}) {
  if (!plan?.available || !GUIDED_TRAINING_MINUTES.includes(plan.minutes) || !validSessionSteps(plan.steps)) return null;
  const startedAt = Number(now);
  const session = {
    schema: SESSION_SCHEMA,
    id: `guided-${startedAt}-${plan.minutes}`,
    owner: sessionOwner(),
    minutes: normalizeDuration(plan.minutes),
    startedAt,
    currentIndex: 0,
    steps: plan.steps,
  };
  writeJsonStorage(STORAGE_SESSION, GUIDED_TRAINING_SESSION_KEY, session);
  return session;
}

// Compare the caller's assignment to the actual persisted assignment. An
// old click must not resurrect a cancelled plan, skip a newer step or finish
// a different session after return/navigation.
export function isCurrentGuidedTrainingStep(session, active) {
  const step = session?.steps?.[session.currentIndex];
  const activeStep = active?.steps?.[active.currentIndex];
  return Boolean(
    typeof session?.id === 'string' && session.id
    && session.id === active?.id
    && session.startedAt === active?.startedAt
    && Number.isInteger(session.currentIndex)
    && session.currentIndex === active?.currentIndex
    && typeof step?.id === 'string' && step.id && step.id === activeStep?.id
  );
}

export function advanceGuidedTrainingSession(session, { now = Date.now() } = {}) {
  const checkedAt = Number(now);
  const normalized = normalizeStoredSession(session, checkedAt);
  if (!normalized || !isCurrentGuidedTrainingStep(normalized, loadGuidedTrainingSession({ now: checkedAt }))) return null;
  const nextIndex = normalized.currentIndex + 1;
  if (nextIndex >= normalized.steps.length) {
    removeStorageItem(STORAGE_SESSION, GUIDED_TRAINING_SESSION_KEY);
    return null;
  }
  const next = { ...normalized, currentIndex: nextIndex };
  writeJsonStorage(STORAGE_SESSION, GUIDED_TRAINING_SESSION_KEY, next);
  return next;
}

export function clearGuidedTrainingSession() {
  removeStorageItem(STORAGE_SESSION, GUIDED_TRAINING_SESSION_KEY);
}
