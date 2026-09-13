import { describe, expect, it } from 'vitest';
import { buildPostGameIncidentEvidence } from './postGameIncidentEvidence.js';

const MISSED_MATE_FEN = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('post-game incident evidence', () => {
  it('classifies a known missed mate from the factual position and move', () => {
    const evidence = buildPostGameIncidentEvidence({
      played: 'Qh3',
      playedFrom: 'h5',
      playedTo: 'h3',
      suggested: 'Qxf7#',
      suggestedFrom: 'h5',
      suggestedTo: 'f7',
      loss: 500,
      evalAfterPlayed: -120,
      evalAfterSuggested: 99999,
      context: { fenBefore: MISSED_MATE_FEN },
    });

    expect(evidence).toMatchObject({
      version: 1,
      moverColor: 'w',
      severity: 'blunder',
      classification: 'missed-mate',
      primaryIncidentKey: 'human:MISSED_MATE',
      incidentKeys: ['human:MISSED_MATE'],
      playedEventType: 'MISSED_MATE',
      suggestedEventType: 'MATE_FOUND',
      lossCp: 500,
      evalAfterPlayed: -120,
      evalAfterSuggested: 99999,
      factualAnalysis: null,
    });
  });

  it('keeps shared-minimax scores and replies separate from legacy evals', () => {
    const evidence = buildPostGameIncidentEvidence({
      played: 'e4',
      playedFrom: 'e2',
      playedTo: 'e4',
      suggested: 'd4',
      suggestedFrom: 'd2',
      suggestedTo: 'd4',
      loss: 73,
      evalAfterSuggested: 100000,
      evalAfterPlayed: 100000,
      factualEvalAfterSuggested: 42,
      factualEvalAfterPlayed: -31,
      suggestedReply: { san: 'd5', from: 'd7', to: 'd5' },
      playedReply: { san: 'e5', from: 'e7', to: 'e5' },
      analysisDepth: 3,
      candidateCount: 20,
      context: { fenBefore: START_FEN },
    });

    expect(evidence.evalAfterSuggested).toBe(100000);
    expect(evidence.evalAfterPlayed).toBe(100000);
    expect(evidence.factualAnalysis).toMatchObject({
      source: 'shared-minimax',
      lossCp: 73,
      evalAfterSuggested: 42,
      evalAfterPlayed: -31,
      suggestedReply: { san: 'd5', from: 'd7', to: 'd5', promotion: null },
      playedReply: { san: 'e5', from: 'e7', to: 'e5', promotion: null },
      analysisDepth: 3,
      candidateCount: 20,
    });
  });

  it('measures material swing from the same factual before/after positions', () => {
    const evidence = buildPostGameIncidentEvidence({
      played: 'Rxa2',
      playedFrom: 'a1',
      playedTo: 'a2',
      loss: 0,
      context: {
        fenBefore: '4k3/8/8/8/8/8/q7/R3K3 w - - 0 1',
        played: { from: 'a1', to: 'a2', san: 'Rxa2', fenAfter: '4k3/8/8/8/8/8/R7/4K3 b - - 0 1' },
      },
    });

    expect(evidence.materialSwingPlayedCp).toBe(900);
    expect(evidence.playedEventType).toBe('QUEEN_CAPTURE');
    expect(evidence.severity).toBe('ok');
  });

  it('preserves explicit missing scores instead of inventing zero evidence', () => {
    const evidence = buildPostGameIncidentEvidence({
      played: 'e4',
      playedFrom: 'e2',
      playedTo: 'e4',
      loss: null,
      evalAfterPlayed: null,
      evalAfterSuggested: null,
      factualEvalAfterPlayed: null,
      factualEvalAfterSuggested: null,
      context: { fenBefore: START_FEN },
    });

    expect(evidence.lossCp).toBeNull();
    expect(evidence.evalAfterPlayed).toBeNull();
    expect(evidence.evalAfterSuggested).toBeNull();
    expect(evidence.factualAnalysis).toBeNull();
    expect(evidence.severity).toBe('unrated');
    expect(evidence.classification).toBe('unrated');
  });

  it('fails closed when the factual FEN is missing or invalid', () => {
    expect(buildPostGameIncidentEvidence({ played: 'e4', loss: 200 })).toBeNull();
    expect(buildPostGameIncidentEvidence({ context: { fenBefore: 'not-a-fen' }, loss: 200 })).toBeNull();
  });
});
