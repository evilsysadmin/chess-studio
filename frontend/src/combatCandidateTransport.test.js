import { describe, expect, it } from 'vitest';
import { selectCombatAwareRemoteSuggestion } from './combatControllerSupport.js';

describe('Combat candidate transport seam', () => {
  it('keeps the established primary move until candidates carry Combat facts', () => {
    const remote = {
      from: 'e7', to: 'e5', san: 'e5',
      candidates: [
        { from: 'd7', to: 'd5', moveKey: 'd7d5', chessScoreCp: 30, isLegal: true },
        { from: 'e7', to: 'e5', moveKey: 'e7e5', chessScoreCp: 10, isLegal: true },
      ],
    };
    expect(selectCombatAwareRemoteSuggestion(remote)).toBe(remote);
  });

  it('activates expected-utility selection only for Combat-ready candidates', () => {
    const remote = {
      from: 'e7', to: 'e5', san: 'e5',
      candidates: [
        { from: 'd7', to: 'd5', moveKey: 'd7d5', chessScoreCp: 20, isLegal: true, combatReady: true },
        { from: 'e7', to: 'e5', moveKey: 'e7e5', chessScoreCp: 10, isLegal: true, combatReady: true, enemyValue: 5, hitChance: 1 },
      ],
    };
    expect(selectCombatAwareRemoteSuggestion(remote).moveKey).toBe('e7e5');
  });
});
