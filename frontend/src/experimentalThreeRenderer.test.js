import { describe, expect, it } from 'vitest';
import {
  EXPERIMENTAL_SHADOW_REFRESH_MS,
  shouldRefreshExperimentalShadows,
} from './experimentalThreeRenderer.js';

describe('experimental Three.js renderer shadow pacing', () => {
  it('refreshes expensive shadow maps independently at 4Hz', () => {
    expect(EXPERIMENTAL_SHADOW_REFRESH_MS).toBe(250);
    expect(shouldRefreshExperimentalShadows(Number.NEGATIVE_INFINITY, 0)).toBe(true);
    expect(shouldRefreshExperimentalShadows(100, 349)).toBe(false);
    expect(shouldRefreshExperimentalShadows(100, 350)).toBe(true);
  });
});
