import { getUsername } from './auth.js';
import { STORAGE_SESSION, readJsonStorage } from './safeStorage.js';

// Small identity check for game start/exit. The full guided-session validator
// stays in its lazy-loaded Training Room module; the app bootstrap must not
// eagerly include all the planning/persistence machinery.
export const GUIDED_TRAINING_SESSION_KEY = 'chess-study-guided-training-session-v1';
export const GUIDED_TRAINING_MINUTES = Object.freeze([5, 15, 30]);
const MAX_AGE_MS = 4 * 60 * 60 * 1000;

// Small shared contract for the active itinerary and the game-return reader.
// Both must agree on budget, step identity and the terminal review after F5.
export function validGuidedTrainingBudget(steps, minutes) {
  if (!GUIDED_TRAINING_MINUTES.includes(minutes)
    || !Array.isArray(steps) || steps.length < 2) return false;
  const ids = new Set();
  let allocated = 0;
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    if (!step || typeof step !== 'object' || Array.isArray(step)
      || typeof step.id !== 'string' || !step.id.trim() || ids.has(step.id)
      || !Number.isInteger(step.minutes) || step.minutes <= 0) return false;
    // "Cerrar sesión" only makes sense at the end of a guided itinerary.
    if ((step.action === 'review') !== (index === steps.length - 1)) return false;
    ids.add(step.id);
    allocated += step.minutes;
    if (allocated > minutes) return false;
  }
  return true;
}

export function readGuidedGameOrigin({ now = Date.now() } = {}) {
  const saved = readJsonStorage(STORAGE_SESSION, GUIDED_TRAINING_SESSION_KEY, { fallback: null });
  if (!saved || saved.schema !== 1 || !validGuidedTrainingBudget(saved.steps, saved.minutes)) return null;
  const owner = String(getUsername() || '').trim().toLowerCase() || null;
  if ((saved.owner || null) !== owner || typeof saved.id !== 'string' || !saved.id.trim()) return null;
  const startedAt = Number(saved.startedAt);
  if (!Number.isFinite(startedAt) || startedAt <= 0 || now - startedAt > MAX_AGE_MS
    || startedAt - now > 60_000) return null;
  if (!Number.isInteger(saved.currentIndex) || saved.currentIndex < 0
    || saved.currentIndex >= saved.steps.length) return null;
  const step = saved.steps[saved.currentIndex];
  if (!step || !['short-game', 'nemesis-position'].includes(step.action)
    || typeof step.id !== 'string' || !step.id.trim()) return null;
  const training = step.training;
  if (!training || typeof training.fen !== 'string' || !training.fen.trim()
    || (training.humanColor !== 'w' && training.humanColor !== 'b')
    || !Number.isFinite(training.difficulty)
    || training.difficulty < 0 || training.difficulty > 100) return null;
  return saved;
}
