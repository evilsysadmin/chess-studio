import { describe, expect, it, vi } from 'vitest';
import { analyzeGame } from './gameReport.js';
import { buildPostGameIncidentEvidence } from './postGameIncidentEvidence.js';
import { personalPuzzleFromMistake } from './personalPuzzles.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function factualMoveReport(overrides = {}) {
  return {
    index: 0,
    moveNumber: 1,
    played: 'e4',
    playedFrom: 'e2',
    playedTo: 'e4',
    suggested: 'd4',
    suggestedFrom: 'd2',
    suggestedTo: 'd4',
    loss: 120,
    factualEvalAfterSuggested: 42,
    factualEvalAfterPlayed: -78,
    analysisDepth: 3,
    candidateCount: 20,
    secondBest: { san: 'c4', from: 'c2', to: 'c4' },
    evalAfterSecondBest: -78,
    bestToSecondGap: 120,
    context: { fenBefore: START_FEN },
    ...overrides,
  };
}

describe('factual best-move constraint', () => {
  it('carries the second-best facts from game report into shared evidence and personal training', async () => {
    const history = [{ san: 'e4', from: 'e2', to: 'e4', piece: 'p' }];
    const api = {
      analyzeMove: vi.fn(async () => ({
        suggested: { san: 'd4', from: 'd2', to: 'd4', piece: 'p', promotion: null },
        suggestedReply: { san: 'd5', from: 'd7', to: 'd5', piece: 'p', promotion: null },
        playedReply: { san: 'e5', from: 'e7', to: 'e5', piece: 'p', promotion: null },
        evalAfterSuggested: 42,
        evalAfterPlayed: -78,
        factualEvalAfterSuggested: 42,
        factualEvalAfterPlayed: -78,
        loss: 120,
        analysisDepth: 3,
        candidateCount: 20,
        secondBest: { san: 'c4', from: 'c2', to: 'c4', piece: 'p', promotion: null },
        evalAfterSecondBest: -78,
        bestToSecondGap: 120,
      })),
    };

    const report = await analyzeGame(history, 'w', api, { maxMoves: 1, throttleMs: 0 });
    const moveReport = report.worst;
    const evidence = buildPostGameIncidentEvidence(moveReport);
    const puzzle = personalPuzzleFromMistake(history, 'w', moveReport, { gameId: 'gap-fixture' });

    expect(moveReport).toMatchObject({
      secondBest: { san: 'c4', from: 'c2', to: 'c4' },
      evalAfterSecondBest: -78,
      bestToSecondGap: 120,
    });
    expect(evidence.factualAnalysis).toMatchObject({
      source: 'shared-minimax',
      secondBest: { san: 'c4', from: 'c2', to: 'c4', promotion: null },
      evalAfterSecondBest: -78,
      bestToSecondGap: 120,
      bestMoveConstraint: { kind: 'clear-best', candidateCount: 20, gapCp: 120 },
    });
    expect(puzzle).not.toBeNull();
    expect(puzzle.factualEvidence.factualAnalysis.bestMoveConstraint).toEqual(
      evidence.factualAnalysis.bestMoveConstraint,
    );
    expect(puzzle.factualEvidence.factualAnalysis.secondBest).toEqual(
      evidence.factualAnalysis.secondBest,
    );
  });

  it('calls a move unique only when the factual root had exactly one legal candidate', () => {
    const evidence = buildPostGameIncidentEvidence(factualMoveReport({
      candidateCount: 1,
      secondBest: null,
      evalAfterSecondBest: null,
      bestToSecondGap: null,
      analysisDepth: 1,
    }));

    expect(evidence.factualAnalysis.bestMoveConstraint).toEqual({
      kind: 'only-legal',
      candidateCount: 1,
      gapCp: null,
    });
  });

  it('does not invent a clear-best claim from shallow or sub-pawn evidence', () => {
    const shallow = buildPostGameIncidentEvidence(factualMoveReport({
      analysisDepth: 1,
      bestToSecondGap: 300,
    }));
    const narrowGap = buildPostGameIncidentEvidence(factualMoveReport({
      analysisDepth: 3,
      bestToSecondGap: 99,
    }));
    const legacy = buildPostGameIncidentEvidence(factualMoveReport({
      secondBest: null,
      evalAfterSecondBest: null,
      bestToSecondGap: null,
    }));

    expect(shallow.factualAnalysis.bestMoveConstraint).toBeNull();
    expect(narrowGap.factualAnalysis.bestMoveConstraint).toBeNull();
    expect(legacy.factualAnalysis.bestMoveConstraint).toBeNull();
  });
});
