import { getUsername } from './auth.js';
import { STORAGE_SESSION, readJsonStorage } from './safeStorage.js';

// Small identity check for game start/exit. The full guided-session validator
// stays in its lazy-loaded Training Room module; the app bootstrap must not
// eagerly include all the planning/persistence machinery.
export const GUIDED_TRAINING_SESSION_KEY = 'chess-study-guided-training-session-v1';
const MAX_AGE_MS = 4 * 60 * 60 * 1000;

export function readGuidedGameOrigin({ now = Date.now() } = {}) {
  const saved = readJsonStorage(STORAGE_SESSION, GUIDED_TRAINING_SESSION_KEY, { fallback: null });
  if (!saved || saved.schema !== 1 || !Array.isArray(saved.steps) || !saved.steps.length) return null;
  const owner = String(getUsername() || '').trim().toLowerCase() || null;
  if ((saved.owner || null) !== owner || typeof saved.id !== 'string' || !saved.id) return null;
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
    || !Number.isFinite(training.difficulty)) return null;
  return saved;
}
