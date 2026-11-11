import { STORAGE_SESSION, readJsonStorage, removeStorageItem, writeJsonStorage } from './safeStorage.js';
import { getUsername } from './auth.js';

// Lightweight persisted-session contract. Game start/exit must not eagerly
// bundle Player Model, puzzle planning and their analysis dependencies.
export const GUIDED_TRAINING_SESSION_KEY = 'chess-study-guided-training-session-v1';
const SESSION_SCHEMA = 1;
const MAX_SESSION_AGE_MS = 4 * 60 * 60 * 1000;

function sessionOwner() {
  return String(getUsername() || '').trim().toLowerCase() || null;
}

export function normalizeDuration(value) {
  const minutes = Number(value);
  if (minutes === 5 || minutes === 15 || minutes === 30) return minutes;
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
    if (!Number.isFinite(training.difficulty)) return false;
  }
  return true;
}

function validSessionSteps(steps) {
  return Array.isArray(steps) && steps.length > 0 && steps.every(validSessionStep);
}

function normalizeStoredSession(value, now = Date.now()) {
  if (!value || value.schema !== SESSION_SCHEMA || !validSessionSteps(value.steps)) return null;
  if ((value.owner || null) !== sessionOwner()) return null;
  const startedAt = Number(value.startedAt || 0);
  if (!startedAt || now - startedAt > MAX_SESSION_AGE_MS || startedAt - now > 60_000) return null;
  const currentIndex = Math.max(0, Math.min(value.steps.length - 1, Math.floor(Number(value.currentIndex) || 0)));
  return {
    schema: SESSION_SCHEMA,
    id: String(value.id || `guided-${startedAt}`),
    owner: value.owner || null,
    minutes: normalizeDuration(value.minutes),
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
  if (!plan?.available || !validSessionSteps(plan.steps)) return null;
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

export function advanceGuidedTrainingSession(session, { now = Date.now() } = {}) {
  const normalized = normalizeStoredSession(session, Number(now));
  if (!normalized) return null;
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
