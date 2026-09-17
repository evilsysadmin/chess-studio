import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { createInitialRegistry, hitChance } from './combat.js';
import { COMBAT_PRIMARY_ANCHOR_MAX_DISAGREEMENT_CP, enrichCombatRemoteSuggestion } from './combatCandidateFacts.js';

function scenario() {
  const fen = 'r6k/8/8/8/8/8/8/Q6K b - - 0 1';
  const registry = createInitialRegistry(new Chess(fen));
  registry.a1 = {
    ...registry.a1,
    identityId: 'white-veteran-queen',
    strengthPoints: 2,
    speedPoints: 1,
  };
  return { fen, registry };
}

describe('Combat candidate factual enrichment', () => {
  it('derives the same capture chance, material value and real veteran value used by Combat', () => {
    const { fen, registry } = scenario();
    const focus = { w: null, b: { targetId: registry.a1.id, streak: 2 } };
    const remote = {
      from: 'a8', to: 'a1', san: 'Rxa1+',
      candidates: [
        { from: 'a8', to: 'a1', moveKey: 'a8a1', chessScoreCp: 30, isLegal: true, isMate: false },
        { from: 'a8', to: 'a7', moveKey: 'a8a7', chessScoreCp: 20, isLegal: true, isMate: false },
      ],
    };

    const enriched = enrichCombatRemoteSuggestion({ fen, registry, focus, remote });
    expect(enriched).not.toBe(remote);
    expect(enriched.candidates.every((candidate) => candidate.combatReady === true)).toBe(true);

    const capture = enriched.candidates.find((candidate) => candidate.moveKey === 'a8a1');
    expect(capture.enemyValue).toBe(9);
    expect(capture.enemyPersistentValue).toBe(3);
    expect(capture.hitChance).toBe(hitChance(registry.a8, registry.a1, 2));
    expect(capture.ownPersistentValue).toBe(0);

    const quiet = enriched.candidates.find((candidate) => candidate.moveKey === 'a8a7');
    expect(quiet.enemyValue).toBe(0);
    expect(quiet.hitChance).toBe(1);
  });

  it('fails closed when the shallow shortlist strongly contradicts the established primary move', () => {
    const { fen, registry } = scenario();
    const remote = {
      from: 'a8', to: 'a1',
      candidates: [
        { from: 'a8', to: 'a1', moveKey: 'a8a1', chessScoreCp: 0, isLegal: true, isMate: false },
        { from: 'a8', to: 'a7', moveKey: 'a8a7', chessScoreCp: COMBAT_PRIMARY_ANCHOR_MAX_DISAGREEMENT_CP + 1, isLegal: true, isMate: false },
      ],
    };
    expect(enrichCombatRemoteSuggestion({ fen, registry, remote })).toBe(remote);
  });

  it('fails closed when the primary is absent or FEN and registry no longer describe the same board', () => {
    const { fen, registry } = scenario();
    const missingPrimary = {
      from: 'a8', to: 'a1',
      candidates: [
        { from: 'a8', to: 'a7', moveKey: 'a8a7', chessScoreCp: 20, isLegal: true, isMate: false },
      ],
    };
    expect(enrichCombatRemoteSuggestion({ fen, registry, remote: missingPrimary })).toBe(missingPrimary);

    const brokenRegistry = { ...registry };
    delete brokenRegistry.a1;
    const complete = {
      from: 'a8', to: 'a1',
      candidates: [
        { from: 'a8', to: 'a1', moveKey: 'a8a1', chessScoreCp: 30, isLegal: true, isMate: false },
        { from: 'a8', to: 'a7', moveKey: 'a8a7', chessScoreCp: 20, isLegal: true, isMate: false },
      ],
    };
    expect(enrichCombatRemoteSuggestion({ fen, registry: brokenRegistry, remote: complete })).toBe(complete);
  });
});
