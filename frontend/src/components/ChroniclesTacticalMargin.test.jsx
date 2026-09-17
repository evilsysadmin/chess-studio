import { describe, expect, it } from 'vitest';

import { chroniclesRetaliationLabel } from './ChroniclesTacticalMargin.jsx';

describe('ChroniclesTacticalMargin', () => {
  it('shows the real retaliation damage when the target can answer', () => {
    expect(chroniclesRetaliationLabel({ willRetaliate: true, retaliation: 2 })).toBe('REPRESALIA · 2 PV');
    expect(chroniclesRetaliationLabel({ willRetaliate: true, retaliation: 1 })).toBe('REPRESALIA · 1 PV');
  });

  it('keeps a compact safe label outside retaliation range', () => {
    expect(chroniclesRetaliationLabel({ willRetaliate: false, retaliation: 2 })).toBe('SIN REPRESALIA');
  });
});
