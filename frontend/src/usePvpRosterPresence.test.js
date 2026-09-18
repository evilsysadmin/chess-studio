import { describe, expect, it } from 'vitest';
import { pvpPollPlan } from './usePvpRosterPresence.js';

describe('PvP roster polling lifecycle', () => {
  it('keeps only the roster heartbeat cadence while the tab is hidden', () => {
    expect(pvpPollPlan({ visibilityState: 'hidden', pollAfterMs: 2000 })).toEqual({
      heartbeatOnly: true,
      delay: 12000,
    });
  });

  it('reuses the server cadence in foreground with a defensive floor', () => {
    expect(pvpPollPlan({ visibilityState: 'visible', pollAfterMs: 750 })).toEqual({
      heartbeatOnly: false,
      delay: 2000,
    });
    expect(pvpPollPlan({ visibilityState: 'visible', pollAfterMs: 4500 })).toEqual({
      heartbeatOnly: false,
      delay: 4500,
    });
  });

  it('falls back safely when the server cadence is malformed', () => {
    expect(pvpPollPlan({ visibilityState: 'visible', pollAfterMs: 'wat' })).toEqual({
      heartbeatOnly: false,
      delay: 3000,
    });
  });
});
