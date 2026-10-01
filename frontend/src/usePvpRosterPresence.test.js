import { describe, expect, it } from 'vitest';
import { pvpPollPlan, pvpPulseNeedsFullRefresh } from './usePvpRosterPresence.js';

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


describe('PvP native lobby pulse invalidation', () => {
  it('requires a full lobby read until a pulse baseline exists', () => {
    expect(pvpPulseNeedsFullRefresh({
      previousRevision: '',
      nextRevision: 'rev-a',
      lastFullAt: 1000,
      nowMs: 2000,
    })).toBe(true);
  });

  it('skips Python while the native revision is stable inside reconcile window', () => {
    expect(pvpPulseNeedsFullRefresh({
      previousRevision: 'rev-a',
      nextRevision: 'rev-a',
      lastFullAt: 1000,
      nowMs: 25000,
    })).toBe(false);
  });

  it('refreshes Python immediately when native state changes', () => {
    expect(pvpPulseNeedsFullRefresh({
      previousRevision: 'rev-a',
      nextRevision: 'rev-b',
      lastFullAt: 1000,
      nowMs: 4000,
    })).toBe(true);
  });

  it('forces a bounded full reconcile even when the pulse stays stable', () => {
    expect(pvpPulseNeedsFullRefresh({
      previousRevision: 'rev-a',
      nextRevision: 'rev-a',
      lastFullAt: 1000,
      nowMs: 31000,
    })).toBe(true);
  });
});
