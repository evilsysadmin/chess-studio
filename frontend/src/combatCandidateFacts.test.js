import { Chess } from 'chess.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { createInitialRegistry } from './combat.js';
import { enrichCombatCandidateResponse } from './combatCandidateFacts.js';
import { resolveCombatCpuTurnSuggestion } from './combatControllerSupport.js';
import { clearCombatSession, combatSessionContextForFen, saveCombatSession } from './combatSession.js';

const FEN = '4k3/8/8/3q4/3R4/8/8/4K3 b - - 0 1';

function battleRegistry() {
  const registry = createInitialRegistry(new Chess(FEN));
  registry.d4 = {
    ...registry.d4,
    id: 'w-r-a1',
    identityId: 'veteran-rook',
    strengthPoints: 3,
    speedPoints: 2,
  };
  registry.d5 = { ...registry.d5, id: 'b-q-d8' };
  return registry;
}

function snapshot(registry, focus = { w: null, b: null }) {
  return {
    phase: 'battle',
    fen: FEN,
    registry,
    humanColor: 'w',
    combatLog: [],
    uiLog: [],
    focus,
    positionCounts: [],
    battleParticipants: [],
    unitBattleStats: {},
  };
}

function remoteCandidates() {
  return {
    from: 'd5', to: 'd6', san: 'Qd6',
    candidates: [
      { from: 'd5', to: 'd4', moveKey: 'd5d4', chessScoreCp: 60, isLegal: true, isMate: false },
      { from: 'd5', to: 'd6', moveKey: 'd5d6', chessScoreCp: 50, isLegal: true, isMate: false },
    ],
  };
}

beforeEach(() => {
  clearCombatSession();
  sessionStorage.clear();
});

describe('Combat candidate factual context', () => {
  it('resolves a unique persisted battle by exact FEN and rejects ambiguity', () => {
    const registry = battleRegistry();
    expect(saveCombatSession('campaign-a', snapshot(registry))).toBe(true);
    expect(combatSessionContextForFen(FEN)).toMatchObject({ sessionId: 'campaign-a', registry });

    expect(saveCombatSession('campaign-b', snapshot(registry))).toBe(true);
    expect(combatSessionContextForFen(FEN)).toBeNull();
  });

  it('attaches real Combat hit chance and measured veteran progress', () => {
    const registry = battleRegistry();
    const remote = {
      from: 'd5', to: 'd4', san: 'Qxd4',
      candidates: [{ from: 'd5', to: 'd4', moveKey: 'd5d4', chessScoreCp: 20, isLegal: true, isMate: false }],
    };

    const enriched = enrichCombatCandidateResponse(remote, { fen: FEN, registry });
    const candidate = enriched.candidates[0];
    expect(candidate.combatReady).toBe(true);
    expect(candidate.enemyValue).toBe(5);
    expect(candidate.enemyPersistentValue).toBe(5);
    expect(candidate.hitChance).toBeGreaterThanOrEqual(0.5);
    expect(candidate.hitChance).toBeLessThanOrEqual(0.9);
    expect(candidate.ownCasualtyRisk).toBe(0);
    expect(remote.candidates[0].combatReady).toBeUndefined();
  });

  it('keeps the deep primary when shallow analysis disagrees too much', () => {
    const registry = battleRegistry();
    const remote = remoteCandidates();
    remote.candidates[0].chessScoreCp = 100;
    remote.candidates[1].chessScoreCp = 0;
    expect(enrichCombatCandidateResponse(remote, { fen: FEN, registry })).toBe(remote);
  });

  it('keeps the deep primary when that move is missing from the shortlist', () => {
    const registry = battleRegistry();
    const remote = remoteCandidates();
    remote.candidates = [remote.candidates[0]];
    expect(enrichCombatCandidateResponse(remote, { fen: FEN, registry })).toBe(remote);
  });

  it('uses the persisted Combat facts to choose a near chess-equivalent attack on a real veteran', async () => {
    const registry = battleRegistry();
    expect(saveCombatSession('campaign-ai', snapshot(registry))).toBe(true);
    const remote = remoteCandidates();

    const result = await resolveCombatCpuTurnSuggestion({
      fen: FEN,
      difficulty: 70,
      analyzePosition: async () => remote,
    });

    expect(result.source).toBe('remote');
    expect(result.suggestion.moveKey).toBe('d5d4');
    expect(result.suggestion.combatReady).toBe(true);
    expect(result.suggestion.enemyPersistentValue).toBe(5);
  });
});
