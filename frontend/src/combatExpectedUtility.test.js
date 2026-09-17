import { describe, expect, it } from 'vitest';
import { chooseCombatCandidate, combatCandidateUtility, rankCombatCandidates } from './combatExpectedUtility.js';

describe('combatExpectedUtility', () => {
  it('keeps checkmate as a hard chess guardrail', () => {
    const choice = chooseCombatCandidate([
      { moveKey: 'a7a8q', isLegal: true, isMate: true, chessScoreCp: 0 },
      { moveKey: 'd4e5', isLegal: true, chessScoreCp: 40, enemyValue: 9, hitChance: 1, expectedBossDamage: 8 },
    ]);
    expect(choice.moveKey).toBe('a7a8q');
  });

  it('can prefer a better Combat capture when chess candidates are close', () => {
    const ranked = rankCombatCandidates([
      { moveKey: 'a1a2', chessScoreCp: 20, enemyValue: 0 },
      { moveKey: 'd4e5', chessScoreCp: 5, enemyValue: 5, hitChance: 0.8 },
    ]);
    expect(ranked[0].moveKey).toBe('d4e5');
    expect(ranked[0].combatUtility).toBeGreaterThan(ranked[1].combatUtility);
  });

  it('penalizes risking a valuable persistent veteran', () => {
    const safe = combatCandidateUtility({
      moveKey: 'b1c3', chessScoreCp: 0, ownPersistentValue: 1, ownCasualtyRisk: 0.05,
    });
    const reckless = combatCandidateUtility({
      moveKey: 'g1f3', chessScoreCp: 0, ownPersistentValue: 8, ownCasualtyRisk: 0.7,
    });
    expect(safe).toBeGreaterThan(reckless);
  });

  it('will not trade a large chess blunder for RPG utility', () => {
    const ranked = rankCombatCandidates([
      { moveKey: 'e7e5', chessScoreCp: 30 },
      { moveKey: 'h7h5', chessScoreCp: -70, enemyValue: 9, hitChance: 1, expectedBossDamage: 20 },
    ], { maxChessLossCp: 80 });
    expect(ranked.map((candidate) => candidate.moveKey)).toEqual(['e7e5']);
  });

  it('filters illegal candidates and uses a deterministic move-key tiebreak', () => {
    const ranked = rankCombatCandidates([
      { moveKey: 'b2b3', chessScoreCp: 0 },
      { moveKey: 'a2a3', chessScoreCp: 0 },
      { moveKey: 'c2c3', isLegal: false, chessScoreCp: 9999 },
    ]);
    expect(ranked.map((candidate) => candidate.moveKey)).toEqual(['a2a3', 'b2b3']);
  });
});
