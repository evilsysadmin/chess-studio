import { describe, expect, it } from 'vitest';
import { pvpMatchPulseNeedsFullRefresh } from './pvpMatchPolling.js';

describe('PvP match pulse refresh policy', () => {
  it('skips Python while revision and presence are stable inside the reconcile window', () => {
    expect(pvpMatchPulseNeedsFullRefresh({
      currentRevision: 7,
      pulseRevision: 7,
      currentOpponentPresence: 'online',
      pulseOpponentPresence: 'online',
      lastFullAt: 1000,
      nowMs: 4000,
    })).toBe(false);
  });

  it('refreshes immediately when the authoritative revision changes', () => {
    expect(pvpMatchPulseNeedsFullRefresh({
      currentRevision: 7,
      pulseRevision: 8,
      currentOpponentPresence: 'online',
      pulseOpponentPresence: 'online',
      lastFullAt: 1000,
      nowMs: 1500,
    })).toBe(true);
  });

  it('refreshes immediately when Go detects a lifecycle deadline', () => {
    expect(pvpMatchPulseNeedsFullRefresh({
      currentRevision: 7,
      pulseRevision: 7,
      currentOpponentPresence: 'disconnected',
      pulseOpponentPresence: 'disconnected',
      lifecycleDue: true,
      lastFullAt: 1000,
      nowMs: 1500,
    })).toBe(true);
  });

  it('refreshes immediately when the opponent presence band changes', () => {
    expect(pvpMatchPulseNeedsFullRefresh({
      currentRevision: 7,
      pulseRevision: 7,
      currentOpponentPresence: 'online',
      pulseOpponentPresence: 'reconnecting',
      lastFullAt: 1000,
      nowMs: 1500,
    })).toBe(true);
  });

  it('forces a bounded Python reconciliation every 15 seconds when stable', () => {
    expect(pvpMatchPulseNeedsFullRefresh({
      currentRevision: 7,
      pulseRevision: 7,
      currentOpponentPresence: 'online',
      pulseOpponentPresence: 'online',
      lastFullAt: 1000,
      nowMs: 16000,
    })).toBe(true);
  });

  it('keeps the old 3 second safety window while a legacy Go pulse lacks presence', () => {
    expect(pvpMatchPulseNeedsFullRefresh({
      currentRevision: 7,
      pulseRevision: 7,
      currentOpponentPresence: 'online',
      lastFullAt: 1000,
      nowMs: 4000,
    })).toBe(true);
  });
});
