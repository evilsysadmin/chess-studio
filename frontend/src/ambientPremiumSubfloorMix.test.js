import { describe, expect, it } from 'vitest';
import { withAmbientPremiumProduction } from './ambientPremiumProduction.js';

describe('ambient premium sub-floor sparse mix', () => {
  it('does not raise very quiet chamber counter or bass lanes to generic floors', () => {
    const authored = { lead: 0.54, counter: 0.20, bass: 0.30, chord: 0.28 };
    const premium = withAmbientPremiumProduction(
      { id: 'very-quiet-chamber', genre: 'Piano / Minimal' },
      {
        family: 'very-quiet-chamber',
        mix: authored,
        percussion: { kit: 'none', punch: 0, period: 40, pattern: {} },
      },
    );

    expect(premium.mix.counter).toBe(0.20);
    expect(premium.mix.bass).toBe(0.30);
    expect(premium.mix.chord).toBe(0.28);
  });
});
