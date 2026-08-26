import { describe, expect, it } from 'vitest';
import { isFreshAccount } from './homeOnboarding.js';

describe('onboarding de Home', () => {
  it('reconoce una cuenta realmente nueva sin asumir progreso', () => {
    expect(isFreshAccount()).toBe(true);
    expect(isFreshAccount({ activity: [{ state: 'started' }] })).toBe(false);
    expect(isFreshAccount({ tournament: { progressPoints: 1 } })).toBe(false);
    expect(isFreshAccount({ combatProgress: { credits: 60 } })).toBe(true);
  });
});
