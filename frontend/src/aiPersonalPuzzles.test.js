import { describe, expect, it } from 'vitest';
import {
  buildPersonalPuzzleBatchDossier,
  parsePersonalPuzzleBatch,
  shouldOfferAiPersonalPuzzleGeneration,
  validateAiPersonalPuzzleCandidate,
} from './aiPersonalPuzzles.js';
import { provesCurrentPersonalPuzzleQuality } from './personalPuzzleQuality.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const FACTUAL_ROOT = {
  analysisDepth: 3,
  candidateCount: 20,
  secondBest: { from: 'd2', to: 'd4', san: 'd4' },
  bestToSecondGap: 120,
  suggestedReply: { from: 'e7', to: 'e5', san: 'e5' },
  suggestedLine: [
    { from: 'e2', to: 'e4', san: 'e4' },
    { from: 'e7', to: 'e5', san: 'e5' },
    { from: 'g1', to: 'f3', san: 'Nf3' },
  ],
};

describe('AI personal puzzle batches', () => {
  it('manda como máximo dos semillas reales y no filtra ids de partida', () => {
    const dossier = buildPersonalPuzzleBatchDossier([
      { fen: START, suggested: 'e4', played: 'a3', loss: 300, source: 'autopsy', sourceGameId: 'SECRET-GAME', incidentKeys: ['human:BLUNDER'] },
      { fen: START, suggested: 'd4', played: 'h3', loss: 200, source: 'autopsy', opening: 'Apertura X' },
      { fen: START, suggested: 'Nf3', played: 'a4', loss: 100, source: 'autopsy' },
    ]);
    expect(dossier.eventType).toBe('personal_puzzle_batch');
    expect(dossier.requestKind).toBe('personal_puzzle_batch');
    expect(dossier.facts.seeds).toHaveLength(2);
    expect(JSON.stringify(dossier)).not.toContain('SECRET-GAME');
  });

  it('no recicla puzzles generados por IA como semillas de otro lote', () => {
    const dossier = buildPersonalPuzzleBatchDossier([
      { fen: START, suggested: 'e4', played: 'a3', loss: 300, source: 'workers-ai-validated' },
      { fen: START, suggested: 'd4', played: 'h3', loss: 200, source: 'autopsy' },
    ]);
    expect(dossier.facts.seeds).toHaveLength(1);
    expect(dossier.facts.seeds[0].better_move).toBe('d4');
  });

  it('parsea JSON limpio o cercado y limita el lote', () => {
    const payload = { candidates: Array.from({ length: 6 }, (_, index) => ({ fen: START, best_uci: index ? 'd2d4' : 'e2e4' })) };
    expect(parsePersonalPuzzleBatch(JSON.stringify(payload))).toHaveLength(4);
    expect(parsePersonalPuzzleBatch('```json\n' + JSON.stringify(payload) + '\n```')).toHaveLength(4);
    expect(parsePersonalPuzzleBatch('esto no es json')).toEqual([]);
  });

  it('acepta sólo una jugada legal con mejor movimiento, defensa y PV probados', async () => {
    const candidate = { fen: START, best_uci: 'e2e4', title: 'Centro', description: 'Empuja el centro.' };
    const accepted = await validateAiPersonalPuzzleCandidate(candidate, {
      analyzeMove: async () => ({ suggested: { from: 'e2', to: 'e4', san: 'e4' }, ...FACTUAL_ROOT }),
    });
    expect(accepted).toMatchObject({
      solution: ['e4'],
      source: 'workers-ai-validated',
      aiValidatedLevel: 92,
      aiQualityVersion: 9,
      tacticalBestMoveChecked: true,
      tacticalRefutationChecked: true,
      tacticalBestDefenseChecked: true,
      enginePrincipalVariationChecked: true,
      engineAnalysisDepth: 3,
      engineCandidateCount: 20,
      engineSecondBest: { from: 'd2', to: 'd4', san: 'd4' },
      engineBestToSecondGap: 120,
      engineTerminalAfterSolution: false,
      engineBestDefense: { from: 'e7', to: 'e5', san: 'e5' },
      enginePrincipalVariation: [
        { from: 'e2', to: 'e4', san: 'e4' },
        { from: 'e7', to: 'e5', san: 'e5' },
        { from: 'g1', to: 'f3', san: 'Nf3' },
      ],
    });
    expect(provesCurrentPersonalPuzzleQuality(accepted)).toBe(true);

    const rejected = await validateAiPersonalPuzzleCandidate(candidate, {
      analyzeMove: async () => ({ suggested: { from: 'd2', to: 'd4', san: 'd4' }, ...FACTUAL_ROOT }),
    });
    expect(rejected).toBeNull();
  });

  it('rechaza una solución no terminal sin PV legal y coherente con la mejor defensa', async () => {
    const candidate = { fen: START, best_uci: 'e2e4' };
    const matching = { suggested: { from: 'e2', to: 'e4', san: 'e4' }, ...FACTUAL_ROOT };

    expect(await validateAiPersonalPuzzleCandidate(candidate, {
      analyzeMove: async () => ({ ...matching, suggestedReply: null }),
    })).toBeNull();
    expect(await validateAiPersonalPuzzleCandidate(candidate, {
      analyzeMove: async () => ({ ...matching, suggestedLine: null }),
    })).toBeNull();
    expect(await validateAiPersonalPuzzleCandidate(candidate, {
      analyzeMove: async () => ({
        ...matching,
        suggestedLine: [
          { from: 'e2', to: 'e4', san: 'e4' },
          { from: 'd7', to: 'd5', san: 'd5' },
        ],
      }),
    })).toBeNull();
    expect(await validateAiPersonalPuzzleCandidate(candidate, {
      analyzeMove: async () => ({
        ...matching,
        suggestedLine: [
          { from: 'e2', to: 'e4', san: 'e4' },
          { from: 'e7', to: 'e5', san: 'e5' },
          { from: 'e2', to: 'e4', san: 'e4' },
        ],
      }),
    })).toBeNull();
  });

  it('acepta mate terminal con PV de un solo ply sin inventar defensa', async () => {
    const candidate = {
      fen: '7k/8/6K1/8/8/8/Q7/8 w - - 0 1',
      best_uci: 'a2a8',
    };
    const accepted = await validateAiPersonalPuzzleCandidate(candidate, {
      analyzeMove: async () => ({
        suggested: { from: 'a2', to: 'a8', san: 'Qa8#' },
        analysisDepth: 3,
        candidateCount: 12,
        secondBest: { from: 'a2', to: 'b2', san: 'Qb2' },
        bestToSecondGap: 500,
        suggestedReply: null,
        suggestedLine: [{ from: 'a2', to: 'a8', san: 'Qa8#' }],
      }),
    });

    expect(accepted).toMatchObject({
      solution: ['Qa8#'],
      tacticalBestDefenseChecked: true,
      enginePrincipalVariationChecked: true,
      engineTerminalAfterSolution: true,
      engineBestDefense: null,
      enginePrincipalVariation: [{ from: 'a2', to: 'a8', san: 'Qa8#' }],
    });
    expect(provesCurrentPersonalPuzzleQuality(accepted)).toBe(true);
  });

  it('rechaza roots poco profundos, incompletos o ambiguos', async () => {
    const candidate = { fen: START, best_uci: 'e2e4' };
    const matching = {
      suggested: { from: 'e2', to: 'e4', san: 'e4' },
      suggestedReply: { from: 'e7', to: 'e5', san: 'e5' },
      suggestedLine: FACTUAL_ROOT.suggestedLine,
    };

    expect(await validateAiPersonalPuzzleCandidate(candidate, {
      analyzeMove: async () => ({ ...matching, analysisDepth: 1, candidateCount: 20, secondBest: { from: 'd2', to: 'd4' }, bestToSecondGap: 300 }),
    })).toBeNull();
    expect(await validateAiPersonalPuzzleCandidate(candidate, {
      analyzeMove: async () => ({ ...matching, analysisDepth: 3, candidateCount: 20, secondBest: null, bestToSecondGap: 300 }),
    })).toBeNull();
    expect(await validateAiPersonalPuzzleCandidate(candidate, {
      analyzeMove: async () => ({ ...matching, analysisDepth: 3, candidateCount: 20, secondBest: { from: 'd2', to: 'd4' }, bestToSecondGap: 99 }),
    })).toBeNull();
    expect(await validateAiPersonalPuzzleCandidate(candidate, {
      analyzeMove: async () => ({ ...matching, analysisDepth: 3, candidateCount: 0, secondBest: null, bestToSecondGap: null }),
    })).toBeNull();
  });

  it('acepta la única jugada legal como constraint factual sin inventar gap', async () => {
    const candidate = { fen: START, best_uci: 'e2e4' };
    const accepted = await validateAiPersonalPuzzleCandidate(candidate, {
      analyzeMove: async () => ({
        suggested: { from: 'e2', to: 'e4', san: 'e4' },
        suggestedReply: { from: 'e7', to: 'e5', san: 'e5' },
        suggestedLine: [
          { from: 'e2', to: 'e4', san: 'e4' },
          { from: 'e7', to: 'e5', san: 'e5' },
        ],
        analysisDepth: 2,
        candidateCount: 1,
        secondBest: null,
        bestToSecondGap: null,
      }),
    });
    expect(accepted).toMatchObject({
      engineCandidateCount: 1,
      engineSecondBest: null,
      engineBestToSecondGap: null,
      engineBestDefense: { from: 'e7', to: 'e5', san: 'e5' },
      enginePrincipalVariationChecked: true,
    });
  });

  it('retira del contrato actual puzzles AI legacy sin PV demostrada', () => {
    expect(provesCurrentPersonalPuzzleQuality({
      source: 'workers-ai-validated',
      aiValidatedLevel: 92,
      aiQualityVersion: 8,
      tacticalBestMoveChecked: true,
      tacticalRefutationChecked: true,
      tacticalBestDefenseChecked: true,
      engineAnalysisDepth: 3,
      engineCandidateCount: 20,
      engineSecondBest: { from: 'd2', to: 'd4' },
      engineBestToSecondGap: 300,
      engineTerminalAfterSolution: false,
      engineBestDefense: { from: 'e7', to: 'e5' },
    })).toBe(false);
    expect(provesCurrentPersonalPuzzleQuality({
      source: 'workers-ai-validated',
      aiValidatedLevel: 92,
      aiQualityVersion: 9,
      tacticalBestMoveChecked: true,
      tacticalRefutationChecked: true,
      tacticalBestDefenseChecked: true,
      enginePrincipalVariationChecked: true,
      engineAnalysisDepth: 3,
      engineCandidateCount: 20,
      engineSecondBest: { from: 'd2', to: 'd4' },
      engineBestToSecondGap: 300,
      engineTerminalAfterSolution: false,
      engineBestDefense: { from: 'e7', to: 'e5' },
      enginePrincipalVariation: [{ from: 'e2', to: 'e4' }],
    })).toBe(false);
  });

  it('rechaza aunque el mock de motor lo bendiga si la jugada deja la pieza comestible sin compensación', async () => {
    const candidate = {
      fen: '3k4/5p2/8/2N5/8/8/8/4K3 w - - 0 1',
      best_uci: 'c5e6',
      title: 'Jaque de humo',
    };
    const rejected = await validateAiPersonalPuzzleCandidate(candidate, {
      analyzeMove: async () => ({
        suggested: { from: 'c5', to: 'e6', san: 'Ne6+' },
        ...FACTUAL_ROOT,
        suggestedReply: { from: 'f7', to: 'e6', san: 'fxe6' },
        suggestedLine: [
          { from: 'c5', to: 'e6', san: 'Ne6+' },
          { from: 'f7', to: 'e6', san: 'fxe6' },
        ],
      }),
    });
    expect(rejected).toBeNull();
  });

  it('sólo ofrece Workers AI cuando existe historial y la cola activa está corta', () => {
    expect(shouldOfferAiPersonalPuzzleGeneration({ total: 1, active: 0 })).toBe(true);
    expect(shouldOfferAiPersonalPuzzleGeneration({ total: 4, active: 3 })).toBe(false);
    expect(shouldOfferAiPersonalPuzzleGeneration({ total: 0, active: 0 })).toBe(false);
  });
});