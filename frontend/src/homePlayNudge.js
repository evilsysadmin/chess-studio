export const HOME_PLAY_NUDGE_IDLE_MS = 5 * 60 * 1000;
export const HOME_PLAY_NUDGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const HOME_PLAY_NUDGE_SESSION_KEY = 'chess-study-home-play-nudge-shown-v1';
export const HOME_PLAY_NUDGE_LAST_AT_KEY = 'chess-study-home-play-nudge-last-at-v1';

function read(storage, key) {
  try {
    return storage?.getItem?.(key) ?? null;
  } catch {
    return null;
  }
}

function write(storage, key, value) {
  try {
    storage?.setItem?.(key, value);
    return true;
  } catch {
    return false;
  }
}

function remove(storage, key) {
  try {
    storage?.removeItem?.(key);
  } catch {
    // El nudge es decorativo; un storage bloqueado no debe romper login/logout.
  }
}

export function homePlayNudgeWasShown(session = globalThis.sessionStorage) {
  return read(session, HOME_PLAY_NUDGE_SESSION_KEY) === '1';
}

export function homePlayNudgeIsCoolingDown(
  now = Date.now(),
  persistent = globalThis.localStorage,
) {
  const lastAt = Number(read(persistent, HOME_PLAY_NUDGE_LAST_AT_KEY));
  if (!Number.isFinite(lastAt) || lastAt <= 0) return false;
  return now < lastAt + HOME_PLAY_NUDGE_COOLDOWN_MS;
}

export function canShowHomePlayNudge({
  now = Date.now(),
  session = globalThis.sessionStorage,
  persistent = globalThis.localStorage,
} = {}) {
  return !homePlayNudgeWasShown(session) && !homePlayNudgeIsCoolingDown(now, persistent);
}

export function markHomePlayNudgeShown({
  now = Date.now(),
  session = globalThis.sessionStorage,
  persistent = globalThis.localStorage,
} = {}) {
  write(session, HOME_PLAY_NUDGE_SESSION_KEY, '1');
  write(persistent, HOME_PLAY_NUDGE_LAST_AT_KEY, String(now));
}

export function clearHomePlayNudgeSession(session = globalThis.sessionStorage) {
  remove(session, HOME_PLAY_NUDGE_SESSION_KEY);
}
