import { describe, expect, it, vi } from 'vitest';
import { buildPostGameIncidentEvidence } from './postGameIncidentEvidence.js';
import { buildShortCounterfactual, counterfactualInputFromReportMove } from './postGameCounterfactual.js';
import { personalPuzzleFromMistake } from './personalPuzzles.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const MISSED_MATE_FEN = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';
const MISSED_MATE_HISTORY = [
  { san: 'e4', from: 'e2', to: 'e4' },
  { san: 'e5', from: 'e7', to: 'e5' },
  { san: 'Bc4', from: 'f1', to: 'c4' },
  { san: 'Nc6', from: 'b8', to: 'c6' },
  { san: 'Qh5', from: 'd1', to: 'h5' },
  { san: 'Nf6', from: 'g8', to: 'f6' },
];

describe('factual incident consumer contract', () => {
  it('keeps missed-mate classification, counterfactual and personal training on the same factual position', async () => {
    const reportMove = {
      index: 6,
      moveNumber: 4,
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
    };

    const evidence = buildPostGameIncidentEvidence(reportMove);
    const counterfactualInput = counterfactualInputFromReportMove(reportMove);
    const puzzle = personalPuzzleFromMistake(MISSED_MATE_HISTORY, 'w', reportMove, { gameId: 'fixture-missed-mate' });
    const analyzeMove = vi.fn();
    const counterfactual = await buildShortCounterfactual({
      ...counterfactualInput,
      analyzeMove,
    });

    expect(evidence).toMatchObject({
      fenBefore: MISSED_MATE_FEN,
      classification: 'missed-mate',
      primaryIncidentKey: 'human:MISSED_MATE',
      incidentKeys: ['human:MISSED_MATE'],
      suggested: { from: 'h5', to: 'f7', san: 'Qxf7#' },
    });
    expect(counterfactualInput).toMatchObject({
      fen: evidence.fenBefore,
      suggested: evidence.suggested,
    });
    expect(counterfactual.line.map((move) => move.san)).toEqual(['Qxf7#']);
    expect(analyzeMove).not.toHaveBeenCalled();
    expect(puzzle).not.toBeNull();
    expect(puzzle.fen).toBe(evidence.fenBefore);
    expect(puzzle.solution).toEqual(['Qxf7#']);
    expect(puzzle.incidentKeys).toEqual(evidence.incidentKeys);
  });

  it('reuses the shared-minimax factual root reply before any extra engine continuation', async () => {
    const reportMove = {
      index: 0,
      moveNumber: 1,
      played: 'e4',
      playedFrom: 'e2',
      playedTo: 'e4',
      suggested: 'd4',
      suggestedFrom: 'd2',
      suggestedTo: 'd4',
      suggestedReply: { san: 'd5', from: 'd7', to: 'd5' },
      loss: 120,
      factualEvalAfterSuggested: 42,
      factualEvalAfterPlayed: -78,
      analysisDepth: 3,
      candidateCount: 20,
      context: { fenBefore: START_FEN },
    };

    const evidence = buildPostGameIncidentEvidence(reportMove);
    const input = counterfactualInputFromReportMove(reportMove);
    const puzzle = personalPuzzleFromMistake([], 'w', reportMove, { gameId: 'fixture-root-reply' });
    const analyzeMove = vi.fn();
    const counterfactual = await buildShortCounterfactual({
      ...input,
      analyzeMove,
      maxPlies: 2,
    });

    expect(evidence.factualAnalysis).toMatchObject({
      source: 'shared-minimax',
      lossCp: 120,
      suggestedReply: { from: 'd7', to: 'd5', san: 'd5' },
      analysisDepth: 3,
      candidateCount: 20,
    });
    expect(input.suggestedReply).toEqual(evidence.factualAnalysis.suggestedReply);
    expect(counterfactual.line.map((move) => move.san)).toEqual(['d4', 'd5']);
    expect(analyzeMove).not.toHaveBeenCalled();
    expect(puzzle).not.toBeNull();
    expect(puzzle.fen).toBe(evidence.fenBefore);
    expect(puzzle.incidentKeys).toEqual(evidence.incidentKeys);
  });
});
