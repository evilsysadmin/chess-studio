import { describe, expect, it } from 'vitest';
import { analyzeGame, resolvedMoveLoss } from './gameReport.js';

describe('gameReport factual evidence', () => {
  it('prefiere el loss factual del backend y conserva fallback legacy', () => {
    expect(resolvedMoveLoss('w', { loss: 73, evalAfterSuggested: 20, evalAfterPlayed: 20 })).toBe(73);
    expect(resolvedMoveLoss('w', { evalAfterSuggested: 50, evalAfterPlayed: 10 })).toBe(40);
    expect(resolvedMoveLoss('b', { evalAfterSuggested: -50, evalAfterPlayed: 10 })).toBe(60);
  });

  it('persiste replies y provenance factual en el informe sin romper evals legacy', async () => {
    const history = [
      { san: 'e4', from: 'e2', to: 'e4', piece: 'p' },
      { san: 'e5', from: 'e7', to: 'e5', piece: 'p' },
    ];
    const mockApi = {
      analyzeMove: async () => ({
        suggested: { san: 'd4', from: 'd2', to: 'd4', piece: 'p' },
        suggestedReply: { san: 'd5', from: 'd7', to: 'd5', piece: 'p' },
        playedReply: { san: 'e5', from: 'e7', to: 'e5', piece: 'p' },
        evalAfterSuggested: 100000,
        evalAfterPlayed: 100000,
        factualEvalAfterSuggested: 42,
        factualEvalAfterPlayed: -31,
        loss: 73,
        analysisDepth: 3,
        candidateCount: 20,
      }),
    };

    const report = await analyzeGame(history, 'w', mockApi, { throttleMs: 0 });

    expect(report.analyzedCount).toBe(1);
    expect(report.worst.loss).toBe(73);
    expect(report.worst.evalAfterSuggested).toBe(100000);
    expect(report.worst.evalAfterPlayed).toBe(100000);
    expect(report.worst.factualEvalAfterSuggested).toBe(42);
    expect(report.worst.factualEvalAfterPlayed).toBe(-31);
    expect(report.worst.suggestedReply).toMatchObject({ san: 'd5', from: 'd7', to: 'd5' });
    expect(report.worst.playedReply).toMatchObject({ san: 'e5', from: 'e7', to: 'e5' });
    expect(report.worst.analysisDepth).toBe(3);
    expect(report.worst.candidateCount).toBe(20);
    expect(report.worst.severity).toBe('mistake');
  });
});
