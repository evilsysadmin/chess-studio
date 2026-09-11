import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStorageMemoryFallback } from './safeStorage.js';
import { cooldownStateFromTimestamp } from './cooldownClock.js';
import {
  markPlayerPortraitManualRefresh,
  playerPortraitManualRefreshState,
} from './aiPlayerPortrait.js';
import {
  markTrainingPlanManualRefresh,
  trainingPlanManualRefreshState,
} from './aiTrainingPlan.js';
import {
  HOME_PLAY_NUDGE_LAST_AT_KEY,
  homePlayNudgeIsCoolingDown,
} from './homePlayNudge.js';
import { requestReleaseReload } from './releaseContinuity.js';

const SIX_HOURS = 6 * 60 * 60 * 1000;

describe('clock-skew safe persistent cooldowns', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearStorageMemoryFallback();
  });

  it('treats a timestamp from the future as invalid cooldown evidence', () => {
    const now = 10 * SIX_HOURS;
    const last = now + (24 * 60 * 60 * 1000);
    expect(cooldownStateFromTimestamp({ now, last, cooldownMs: SIX_HOURS })).toEqual({
      allowed: true,
      retryAfterMs: 0,
      nextAllowedAt: null,
    });
  });

  it('applies the same future-timestamp recovery to portrait and training manual refreshes', () => {
    const identityScope = 'alice';
    const now = 10 * SIX_HOURS;
    const future = now + (24 * 60 * 60 * 1000);

    expect(markPlayerPortraitManualRefresh({ now: future, identityScope })).toBe(true);
    expect(markTrainingPlanManualRefresh({ now: future, identityScope })).toBe(true);

    expect(playerPortraitManualRefreshState({ now, identityScope })).toEqual({
      allowed: true,
      retryAfterMs: 0,
      nextAllowedAt: null,
    });
    expect(trainingPlanManualRefreshState({ now, identityScope })).toEqual({
      allowed: true,
      retryAfterMs: 0,
      nextAllowedAt: null,
    });
  });

  it('keeps normal cooldowns intact and expires them without negative retry times', () => {
    const identityScope = 'alice';
    const last = 10 * SIX_HOURS;

    markPlayerPortraitManualRefresh({ now: last, identityScope });
    markTrainingPlanManualRefresh({ now: last, identityScope });

    expect(playerPortraitManualRefreshState({ now: last + 1000, identityScope }).retryAfterMs).toBe(SIX_HOURS - 1000);
    expect(trainingPlanManualRefreshState({ now: last + SIX_HOURS + 1, identityScope })).toEqual({
      allowed: true,
      retryAfterMs: 0,
      nextAllowedAt: null,
    });
  });

  it('recovers Home nudge and chunk reload guard from future timestamps', () => {
    const now = 1_000_000;
    const future = now + 86_400_000;
    localStorage.setItem(HOME_PLAY_NUDGE_LAST_AT_KEY, String(future));
    expect(homePlayNudgeIsCoolingDown(now)).toBe(false);

    const values = new Map([['chess-study-release-reload-at', String(future)]]);
    const storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
    };
    const reload = vi.fn();
    expect(requestReleaseReload({ storage, reload, now })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(values.get('chess-study-release-reload-at')).toBe(String(now));
  });
});
