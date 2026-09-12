import { describe, expect, it } from 'vitest';
import { homeCastleTorchFlicker } from './HomeCastle3DTorchFlicker.js';

describe('homeCastleTorchFlicker', () => {
  it('keeps motion restrained around the base intensity', () => {
    const samples = [];
    for (let ms = 0; ms <= 5000; ms += 125) {
      samples.push(homeCastleTorchFlicker(0, ms));
      samples.push(homeCastleTorchFlicker(1, ms));
    }
    expect(Math.min(...samples)).toBeGreaterThan(0.93);
    expect(Math.max(...samples)).toBeLessThan(1.07);
  });

  it('desynchronizes the two canonical torches', () => {
    expect(homeCastleTorchFlicker(0, 1200)).not.toBe(homeCastleTorchFlicker(1, 1200));
  });

  it('becomes completely static for reduced motion', () => {
    expect(homeCastleTorchFlicker(0, 0, true)).toBe(1);
    expect(homeCastleTorchFlicker(1, 4800, true)).toBe(1);
  });
});
