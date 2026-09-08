import { describe, expect, it } from 'vitest';
import { CHESSCOM_DEPTH_TONE_V10, chesscomDepthToneProfile } from './chesscomDepthToneV10.js';

describe('Chesscom depth/tone v10', () => {
  it('keeps balanced conservative and high/ultra progressively richer', () => {
    expect(CHESSCOM_DEPTH_TONE_V10.identity).toBe('depth-tone-v10');
    const balanced=chesscomDepthToneProfile('balanced');
    const high=chesscomDepthToneProfile('high');
    const ultra=chesscomDepthToneProfile('ultra');
    expect(balanced.shadowMode).toBe('blur');
    expect(high.shadowMode).toBe('pcf');
    expect(ultra.shadowMode).toBe('pcss');
    expect(ultra.warmScale).toBeLessThan(high.warmScale);
    expect(high.warmScale).toBeLessThan(balanced.warmScale);
    expect(ultra.exposureMax).toBeLessThanOrEqual(high.exposureMax);
  });
});
