export const RECONNECT_AUTO_RETRY_LIMIT = 10;
export const RECONNECT_BACKOFF_BASE_MS = 1000;
export const RECONNECT_BACKOFF_MAX_MS = 30000;
export const RECONNECT_BACKOFF_JITTER = 0.20;

export function reconnectBackoffDelayMs(attempt, {
  random = Math.random,
  baseMs = RECONNECT_BACKOFF_BASE_MS,
  maxMs = RECONNECT_BACKOFF_MAX_MS,
  jitter = RECONNECT_BACKOFF_JITTER,
} = {}) {
  const safeAttempt = Math.max(0, Math.floor(Number(attempt) || 0));
  const raw = Math.min(
    Math.max(1, Number(maxMs) || RECONNECT_BACKOFF_MAX_MS),
    Math.max(1, Number(baseMs) || RECONNECT_BACKOFF_BASE_MS) * (2 ** safeAttempt),
  );
  const safeJitter = Math.max(0, Math.min(0.5, Number(jitter) || 0));
  const sample = Math.max(0, Math.min(1, Number(random?.()) || 0));
  const factor = 1 + ((sample * 2) - 1) * safeJitter;
  return Math.max(1, Math.round(raw * factor));
}
