import { describe, expect, it } from 'vitest';
import { chroniclesPartyCondition } from './chroniclesOfMatthiasPartyCondition.js';

describe('Chronicles party portrait condition', () => {
  it('keeps healthy pieces visually fresh', () => {
    expect(chroniclesPartyCondition({ hp: 7, maxHp: 7 })).toBe('fresh');
    expect(chroniclesPartyCondition({ hp: 7, maxHp: 10 })).toBe('fresh');
  });

  it('shows accumulated damage without inventing a new status system', () => {
    expect(chroniclesPartyCondition({ hp: 6, maxHp: 10 })).toBe('worn');
    expect(chroniclesPartyCondition({ hp: 3, maxHp: 10 })).toBe('critical');
  });

  it('marks only zero HP as down', () => {
    expect(chroniclesPartyCondition({ hp: 1, maxHp: 10 })).toBe('critical');
    expect(chroniclesPartyCondition({ hp: 0, maxHp: 10 })).toBe('down');
  });
});
