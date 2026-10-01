import { describe, expect, it } from 'vitest';
import { pvpMatchPulseNeedsFullRefresh } from './pvpMatchPolling.js';

describe('PvP match pulse refresh policy', () => {
  it('skips Python while the revision is stable inside the reconcile window', () => {
    expect(pvpMatchPulseNeedsFullRefresh({
      currentRevision: 7,
      pulseRevision: 7,
      lastFullAt: 1000,
      nowMs: 2500,
    })).toBe(false);
  });

  it('refreshes immediately when the authoritative revision changes', () => {
    expect(pvpMatchPulseNeedsFullRefresh({
      currentRevision: 7,
      pulseRevision: 8,
      lastFullAt: 1000,
      nowMs: 1500,
    })).toBe(true);
  });

  it('refreshes immediately when Go detects a lifecycle deadline', () => {
    expect(pvpMatchPulseNeedsFullRefresh({
      currentRevision: 7,
      pulseRevision: 7,
      lifecycleDue: true,
      lastFullAt: 1000,
      nowMs: 1500,
    })).toBe(true);
  });

  it('forces a bounded Python reconciliation even when stable', () => {
    expect(pvpMatchPulseNeedsFullRefresh({
      currentRevision: 7,
      pulseRevision: 7,
      lastFullAt: 1000,
      nowMs: 4000,
    })).toBe(true);
  });
});
