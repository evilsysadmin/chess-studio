import { describe, expect, it } from 'vitest';
import { cpuPresentationDelayMs } from './cpuPresentationTiming.js';

describe('Matthias response presentation', () => {
  it('spreads normal thinking over two to three seconds', () => {
    expect(cpuPresentationDelayMs({ random: 0 })).toBe(2000);
    expect(cpuPresentationDelayMs({ random: 0.5 })).toBe(2500);
    expect(cpuPresentationDelayMs({ random: 1 })).toBe(3000);
  });
  it('avoids an artificial delay near flag fall', () => {
    expect(cpuPresentationDelayMs({ cpuTime: 8, random: 1 })).toBe(350);
    expect(cpuPresentationDelayMs({ cpuTime: 2, random: 1 })).toBe(350);
    expect(cpuPresentationDelayMs({ cpuTime: 10, random: 0 })).toBe(2000);
  });
});
