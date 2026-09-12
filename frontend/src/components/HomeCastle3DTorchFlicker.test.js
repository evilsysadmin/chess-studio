import { describe, expect, it } from 'vitest';
import {
  homeCastleChandelierShimmer,
  homeCastleFireplacePulse,
  homeCastleTorchFlicker,
} from './HomeCastle3DTorchFlicker.js';

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

describe('homeCastleChandelierShimmer', () => {
  it('moves much more slowly and subtly than the wall torches', () => {
    const samples = [];
    for (let ms = 0; ms <= 12000; ms += 250) {
      samples.push(homeCastleChandelierShimmer(0, ms));
      samples.push(homeCastleChandelierShimmer(1, ms));
    }
    expect(Math.min(...samples)).toBeGreaterThan(0.97);
    expect(Math.max(...samples)).toBeLessThan(1.03);
  });

  it('uses distinct phases for the two canonical chandeliers', () => {
    expect(homeCastleChandelierShimmer(0, 3200)).not.toBe(homeCastleChandelierShimmer(1, 3200));
  });

  it('is completely static for reduced motion', () => {
    expect(homeCastleChandelierShimmer(0, 0, true)).toBe(1);
    expect(homeCastleChandelierShimmer(1, 12000, true)).toBe(1);
  });
});

describe('homeCastleFireplacePulse', () => {
  it('keeps the hearth alive without approaching torch flicker amplitude', () => {
    const samples = [];
    for (let ms = 0; ms <= 8000; ms += 125) samples.push(homeCastleFireplacePulse(ms));
    expect(Math.min(...samples)).toBeGreaterThan(0.96);
    expect(Math.max(...samples)).toBeLessThan(1.04);
  });

  it('changes over time without randomness', () => {
    expect(homeCastleFireplacePulse(1500)).not.toBe(homeCastleFireplacePulse(3500));
    expect(homeCastleFireplacePulse(1500)).toBe(homeCastleFireplacePulse(1500));
  });

  it('is completely static for reduced motion', () => {
    expect(homeCastleFireplacePulse(0, true)).toBe(1);
    expect(homeCastleFireplacePulse(8000, true)).toBe(1);
  });
});
