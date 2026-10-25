import { describe, expect, it } from 'vitest';
import { cpuPresentationDelayMs } from './cpuPresentationTiming.js';

describe('Matthias response presentation', () => {
  it('spreads normal thinking over one and a half to two and a half seconds', () => {
    expect(cpuPresentationDelayMs({ random: 0 })).toBe(1500);
    expect(cpuPresentationDelayMs({ random: 0.5 })).toBe(2000);
    expect(cpuPresentationDelayMs({ random: 1 })).toBe(2500);
  });
  it('does not pretend Matthias is thinking after human checkmate or stalemate', () => {
    expect(cpuPresentationDelayMs({ gameOver: true, random: 1 })).toBe(0);
    expect(cpuPresentationDelayMs({ gameOver: true, cpuTime: 2 })).toBe(0);
  });
  it('avoids an artificial delay near flag fall', () => {
    expect(cpuPresentationDelayMs({ cpuTime: 8, random: 1 })).toBe(350);
    expect(cpuPresentationDelayMs({ cpuTime: 2, random: 1 })).toBe(350);
    expect(cpuPresentationDelayMs({ cpuTime: 10, random: 0 })).toBe(1500);
  });
});
