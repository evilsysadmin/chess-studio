import { describe, expect, it } from 'vitest';
import {
  MATTHIAS_DISCOVERY_DEFAULT_COOLDOWN_MS,
  matthiasDiscoveryChance,
  shouldSurfaceMatthias,
} from './matthiasDiscovery.js';

describe('Matthias discovery policy', () => {
  it('keeps the established relationship thresholds', () => {
    expect(matthiasDiscoveryChance({ relationshipTier: 'newcomer' })).toBe(0.40);
    expect(matthiasDiscoveryChance({ relationshipTier: 'acquainted' })).toBe(0.32);
    expect(matthiasDiscoveryChance({ relationshipTier: 'regular' })).toBe(0.24);
    expect(matthiasDiscoveryChance({ relationshipTier: 'veteran' })).toBe(0.18);
    expect(matthiasDiscoveryChance({ relationshipTier: 'unknown' })).toBe(0.30);
    expect(matthiasDiscoveryChance({ relationshipTier: 'veteran', relevance: 'meaningful' })).toBe(0.42);
  });

  it('blocks overlays, priority surfaces and repeat exposure inside the same session upstream', () => {
    expect(shouldSurfaceMatthias({ blocked: true, randomValue: 0 })).toBe(false);
    expect(shouldSurfaceMatthias({ sessionSeen: true, randomValue: 0 })).toBe(false);
  });

  it('enforces the common cooldown before evaluating chance', () => {
    const now = 1_000_000_000;
    expect(shouldSurfaceMatthias({
      now,
      lastShownAt: now - MATTHIAS_DISCOVERY_DEFAULT_COOLDOWN_MS + 1,
      randomValue: 0,
    })).toBe(false);
    expect(shouldSurfaceMatthias({
      now,
      lastShownAt: now - MATTHIAS_DISCOVERY_DEFAULT_COOLDOWN_MS,
      randomValue: 0,
    })).toBe(true);
  });

  it('does not let a future timestamp mute discovery indefinitely after device clock correction', () => {
    const now = 1_000_000_000;
    expect(shouldSurfaceMatthias({
      now,
      lastShownAt: now + (3 * 24 * 60 * 60 * 1000),
      randomValue: 0,
    })).toBe(true);
    expect(shouldSurfaceMatthias({
      now,
      lastShownAt: now + (3 * 24 * 60 * 60 * 1000),
      sessionSeen: true,
      randomValue: 0,
    })).toBe(false);
  });

  it('uses relevance and relationship only after eligibility passes', () => {
    expect(shouldSurfaceMatthias({ relationshipTier: 'veteran', randomValue: 0.17 })).toBe(true);
    expect(shouldSurfaceMatthias({ relationshipTier: 'veteran', randomValue: 0.18 })).toBe(false);
    expect(shouldSurfaceMatthias({ relationshipTier: 'veteran', relevance: 'meaningful', randomValue: 0.41 })).toBe(true);
    expect(shouldSurfaceMatthias({ relationshipTier: 'veteran', relevance: 'meaningful', randomValue: 0.42 })).toBe(false);
  });
});
