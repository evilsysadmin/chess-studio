import { getUsername } from './auth.js';
import { STORAGE_LOCAL, STORAGE_SESSION, getStorageItem, setStorageItem } from './safeStorage.js';
import { setProfileStorageItem } from './profileKeys.js';

export const POST_GAME_FEEDBACK_KEY = 'chess-study-post-game-feedback-v1';
const SESSION_KEY = 'chess-study-post-game-feedback-session-v1';
const FIRST_PROMPT_GAME = 3;
const LATER_PROMPT_CHANCE = 0.20;
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
const THANK_YOU_MS = 14 * 24 * 60 * 60 * 1000;

function readState() {
  try {
    const parsed = JSON.parse(getStorageItem(STORAGE_LOCAL, POST_GAME_FEEDBACK_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeState(state) {
  setProfileStorageItem(POST_GAME_FEEDBACK_KEY, JSON.stringify(state));
}

export function shouldAskPostGameFeedback({ completedGames = 0, nextPromptAt = 0, sessionAsked = false, now = Date.now(), randomValue = Math.random() } = {}) {
  if (sessionAsked || nextPromptAt > now) return false;
  if (completedGames === FIRST_PROMPT_GAME) return true;
  return completedGames > FIRST_PROMPT_GAME && randomValue < LATER_PROMPT_CHANCE;
}

export function registerCompletedGameForFeedback({ gameId, now = Date.now(), randomValue = Math.random() } = {}) {
  if (!gameId) return false;
  const state = readState();
  if (state.lastGameId === gameId) return false;

  const completedGames = Math.max(0, Number(state.completedGames) || 0) + 1;
  const next = { ...state, completedGames, lastGameId: gameId };
  writeState(next);

  const username = String(getUsername() || '').trim().toLowerCase();
  const sessionAsked = Boolean(username) && getStorageItem(STORAGE_SESSION, SESSION_KEY) === username;
  const ask = shouldAskPostGameFeedback({
    completedGames,
    nextPromptAt: Number(state.nextPromptAt) || 0,
    sessionAsked,
    now,
    randomValue,
  });
  if (ask && username) setStorageItem(STORAGE_SESSION, SESSION_KEY, username);
  return ask;
}

export function snoozePostGameFeedback(now = Date.now()) {
  const state = readState();
  writeState({ ...state, nextPromptAt: now + SNOOZE_MS });
}

export function completePostGameFeedback(now = Date.now()) {
  const state = readState();
  writeState({ ...state, nextPromptAt: now + THANK_YOU_MS });
}
