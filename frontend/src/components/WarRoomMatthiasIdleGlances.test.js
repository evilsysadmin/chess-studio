import { describe, expect, it } from 'vitest';
import { resolveMatthiasIdleGlance } from './WarRoomMatthiasIdleGlances.js';

describe('WarRoomMatthiasIdleGlances', () => {
  it('keeps long quiet gaps between sparse ambient looks', () => {
    expect(resolveMatthiasIdleGlance(0).active).toBe(false);
    expect(resolveMatthiasIdleGlance(800).key).toBe('board');
    expect(resolveMatthiasIdleGlance(800).weight).toBeGreaterThan(0.9);
    expect(resolveMatthiasIdleGlance(4_000).active).toBe(false);
    expect(resolveMatthiasIdleGlance(23_000).active).toBe(false);
  });

  it('rotates deterministically through board, window and hearth', () => {
    expect(resolveMatthiasIdleGlance(800).key).toBe('board');
    expect(resolveMatthiasIdleGlance(24_800).key).toBe('window');
    expect(resolveMatthiasIdleGlance(48_800).key).toBe('hearth');
    expect(resolveMatthiasIdleGlance(72_800).key).toBe('board');
  });

  it('keeps the head movement deliberately restrained', () => {
    for (const elapsed of [800, 24_800, 48_800]) {
      const glance = resolveMatthiasIdleGlance(elapsed);
      expect(Math.abs(glance.yaw)).toBeLessThanOrEqual(0.16);
      expect(Math.abs(glance.pitch)).toBeLessThanOrEqual(0.085);
      expect(glance.weight).toBeGreaterThanOrEqual(0);
      expect(glance.weight).toBeLessThanOrEqual(1);
    }
  });
});
