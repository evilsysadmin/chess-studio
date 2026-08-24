import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OBSERVABILITY_AUTO_REFRESH_MS,
  OBSERVABILITY_AUTO_REFRESH_OPTIONS,
  isObservabilityAutoRefreshInterval,
} from './observabilityRefresh.js';

describe('observability auto-refresh config', () => {
  it('offers the supported refresh cadences and defaults to one minute', () => {
    expect(OBSERVABILITY_AUTO_REFRESH_OPTIONS).toEqual([
      { value: 30000, label: '30 s' },
      { value: 60000, label: '1 min' },
      { value: 120000, label: '2 min' },
      { value: 300000, label: '5 min' },
      { value: 900000, label: '15 min' },
    ]);
    expect(DEFAULT_OBSERVABILITY_AUTO_REFRESH_MS).toBe(60000);
  });

  it('accepts only configured intervals', () => {
    expect(isObservabilityAutoRefreshInterval(30000)).toBe(true);
    expect(isObservabilityAutoRefreshInterval('120000')).toBe(true);
    expect(isObservabilityAutoRefreshInterval(45000)).toBe(false);
  });
});
