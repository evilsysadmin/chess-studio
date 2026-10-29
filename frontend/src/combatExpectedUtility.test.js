import { describe, expect, it } from 'vitest';
import { chooseCombatCandidate, combatCandidateUtility, hasMeasuredChessScoreCp, rankCombatCandidates } from './combatExpectedUtility.js';

describe('combatExpectedUtility', () => {
  it('keeps checkmate as a hard chess guardrail', () => {
    const choice = chooseCombatCandidate([
      { moveKey: 'a7a8q', isLegal: true, isMate: true, chessScoreCp: 0 },
      { moveKey: 'd4e5', isLegal: true, chessScoreCp: 40, enemyValue: 9, hitChance: 1, expectedBossDamage: 8 },
    ]);
    expect(choice.moveKey).toBe('a7a8q');
  });

  it('discounts a deterministic chess capture by its Combat miss risk', () => {
    const ranked = rankCombatCandidates([
      { moveKey: 'a1a2', chessScoreCp: 20, enemyValue: 0 },
      { moveKey: 'd4e5', chessScoreCp: 60, enemyValue: 5, hitChance: 0.5 },
    ]);
    expect(ranked[0].moveKey).toBe('a1a2');
    expect(ranked[1].combatUtility).toBeLessThan(ranked[0].combatUtility);
  });

  it('still prefers a near-best capture when its Combat hit chance is high', () => {
    const ranked = rankCombatCandidates([
      { moveKey: 'a1a2', chessScoreCp: 20, enemyValue: 0 },
      { moveKey: 'd4e5', chessScoreCp: 40, enemyValue: 1, hitChance: 0.95 },
    ]);
    expect(ranked[0].moveKey).toBe('d4e5');
  });

  it('can value a persistent veteran target without double-counting normal material', () => {
    const ranked = rankCombatCandidates([
      { moveKey: 'c6b4', chessScoreCp: 15, enemyValue: 3, enemyPersistentValue: 1, hitChance: 0.9 },
      { moveKey: 'c6d4', chessScoreCp: 15, enemyValue: 3, enemyPersistentValue: 5, hitChance: 0.9 },
    ]);
    expect(ranked[0].moveKey).toBe('c6d4');
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
      { moveKey: 'h7h5', chessScoreCp: -70, enemyValue: 9, hitChance: 1, enemyPersistentValue: 20 },
    ], { maxChessLossCp: 80 });
    expect(ranked.map((candidate) => candidate.moveKey)).toEqual(['e7e5']);
  });

  it('no confunde ausencia de evaluación con 0 centipeones', () => {
    for (const value of [null, undefined, '', ' ', false, {}, Number.POSITIVE_INFINITY]) {
      expect(hasMeasuredChessScoreCp({ chessScoreCp: value })).toBe(false);
    }
    for (const value of [0, -25, '0', ' -25 ']) {
      expect(hasMeasuredChessScoreCp({ chessScoreCp: value })).toBe(true);
    }
    const ranked = rankCombatCandidates([
      { moveKey: 'a1a2', chessScoreCp: null, enemyPersistentValue: 500, hitChance: 1 },
      { moveKey: 'a1a3', chessScoreCp: '', enemyPersistentValue: 500, hitChance: 1 },
      { moveKey: 'a1a4', chessScoreCp: -15, enemyValue: 0 },
      { moveKey: 'a1a5', chessScoreCp: '-18', enemyValue: 0 },
    ]);
    expect(ranked.map((move) => move.moveKey)).toEqual(['a1a4', 'a1a5']);
    expect(rankCombatCandidates([{ moveKey: 'none', chessScoreCp: null }])).toEqual([]);
    expect(chooseCombatCandidate([{ moveKey: 'mate', isMate: true, chessScoreCp: null }]).moveKey).toBe('mate');
  });

  it('acota la doctrina a pocos centipeones sin desplazar los hechos de combate', () => {
    const plain = { moveKey: 'a8b8', chessScoreCp: 10, hitChance: 1 };
    const baseline = combatCandidateUtility(plain);
    expect(combatCandidateUtility({ ...plain, doctrineBonusCp: 999 })).toBe(baseline + 6);
    expect(combatCandidateUtility({ ...plain, doctrineBonusCp: -999 })).toBe(baseline - 6);
    expect(combatCandidateUtility({ ...plain, doctrineBonusCp: null })).toBe(baseline);
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
