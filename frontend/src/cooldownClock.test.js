import { beforeEach, describe, expect, it } from 'vitest';
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

const SIX_HOURS = 6 * 60 * 60 * 1000;

describe('clock-skew safe cooldowns', () => {
  beforeEach(() => {
    localStorage.clear();
    clearStorageMemoryFallback();
  });

  it('never extends a cooldown beyond its nominal duration when the clock moves backwards', () => {
    const last = 10 * SIX_HOURS;
    const now = last - (24 * 60 * 60 * 1000);
    expect(cooldownStateFromTimestamp({ now, last, cooldownMs: SIX_HOURS })).toEqual({
      allowed: false,
      retryAfterMs: SIX_HOURS,
      nextAllowedAt: now + SIX_HOURS,
    });
  });

  it('applies the same backward-skew cap to portrait and training manual refreshes', () => {
    const identityScope = 'alice';
    const last = 10 * SIX_HOURS;
    const now = last - (24 * 60 * 60 * 1000);

    expect(markPlayerPortraitManualRefresh({ now: last, identityScope })).toBe(true);
    expect(markTrainingPlanManualRefresh({ now: last, identityScope })).toBe(true);

    const portrait = playerPortraitManualRefreshState({ now, identityScope });
    const training = trainingPlanManualRefreshState({ now, identityScope });

    expect(portrait.retryAfterMs).toBe(SIX_HOURS);
    expect(training.retryAfterMs).toBe(SIX_HOURS);
    expect(portrait.nextAllowedAt).toBe(now + SIX_HOURS);
    expect(training.nextAllowedAt).toBe(now + SIX_HOURS);
  });

  it('expires normally after a forward clock jump without negative retry times', () => {
    const identityScope = 'alice';
    const last = 10 * SIX_HOURS;
    const now = last + SIX_HOURS + 1;

    markPlayerPortraitManualRefresh({ now: last, identityScope });
    markTrainingPlanManualRefresh({ now: last, identityScope });

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
});
