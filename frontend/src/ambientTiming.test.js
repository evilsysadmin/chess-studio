import { describe, expect, it } from 'vitest';
import { shouldPlayStructuredLead, shouldPlayStructuredSignature } from './ambientTiming.js';

describe('structured arrangement timing', () => {
  it('keeps complete, downbeat-led phrases in sparse lead mode', () => {
    expect(Array.from({ length: 12 }, (_, step) => shouldPlayStructuredLead('sparse', step, 32))).toEqual([
      true, true, true, true,
      false, false, false, false,
      true, true, true, true,
    ]);
  });

  it('keeps late and full lead modes unchanged', () => {
    expect(shouldPlayStructuredLead('late', 15, 32)).toBe(false);
    expect(shouldPlayStructuredLead('late', 16, 32)).toBe(true);
    expect(shouldPlayStructuredLead('full', 0, 32)).toBe(true);
  });

  it('suppresses only an exact signature double-trigger', () => {
    const activeVoices = [
      { instrument: 'spiccatoStrings', note: 64 },
      { instrument: 'feltGrand', note: 76 },
    ];

    expect(shouldPlayStructuredSignature(
      { instrument: 'spiccatoStrings', note: 64 },
      activeVoices,
    )).toBe(false);
    expect(shouldPlayStructuredSignature(
      { instrument: 'spiccatoStrings', note: 67 },
      activeVoices,
    )).toBe(true);
    expect(shouldPlayStructuredSignature(
      { instrument: 'feltGrand', note: 64 },
      activeVoices,
    )).toBe(true);
  });
});
