import { describe, expect, it } from 'vitest';
import { shouldEnableHomePlayNudge } from './homePlayNudgePolicy.js';

describe('shouldEnableHomePlayNudge', () => {
  it('se habilita solo cuando Home está libre y no hay partida guardada', () => {
    expect(shouldEnableHomePlayNudge()).toBe(true);
    expect(shouldEnableHomePlayNudge({ suppressHomeNudge: true })).toBe(false);
    expect(shouldEnableHomePlayNudge({ hasOpenOverlay: true })).toBe(false);
    expect(shouldEnableHomePlayNudge({ loggingOut: true })).toBe(false);
    expect(shouldEnableHomePlayNudge({ hasSavedGame: true })).toBe(false);
  });
});
