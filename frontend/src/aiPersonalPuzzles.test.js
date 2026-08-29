import { describe, expect, it } from 'vitest';
import {
  buildPersonalPuzzleBatchDossier,
  parsePersonalPuzzleBatch,
  shouldOfferAiPersonalPuzzleGeneration,
  validateAiPersonalPuzzleCandidate,
} from './aiPersonalPuzzles.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

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

  it('acepta sólo una jugada legal que coincida con el minimax local', async () => {
    const candidate = { fen: START, best_uci: 'e2e4', title: 'Centro', description: 'Empuja el centro.' };
    const accepted = await validateAiPersonalPuzzleCandidate(candidate, {
      analyzeMove: async () => ({ suggested: { from: 'e2', to: 'e4', san: 'e4' } }),
    });
    expect(accepted).toMatchObject({ solution: ['e4'], source: 'workers-ai-validated', aiValidatedLevel: 92, aiQualityVersion: 5, tacticalBestMoveChecked: true, tacticalRefutationChecked: true });

    const rejected = await validateAiPersonalPuzzleCandidate(candidate, {
      analyzeMove: async () => ({ suggested: { from: 'd2', to: 'd4', san: 'd4' } }),
    });
    expect(rejected).toBeNull();
  });


  it('rechaza aunque el mock de motor lo bendiga si la jugada deja la pieza comestible sin compensación', async () => {
    const candidate = {
      fen: '3k4/5p2/8/2N5/8/8/8/4K3 w - - 0 1',
      best_uci: 'c5e6',
      title: 'Jaque de humo',
    };
    const rejected = await validateAiPersonalPuzzleCandidate(candidate, {
      analyzeMove: async () => ({ suggested: { from: 'c5', to: 'e6', san: 'Ne6+' } }),
    });
    expect(rejected).toBeNull();
  });

  it('sólo ofrece Workers AI cuando existe historial y la cola activa está corta', () => {
    expect(shouldOfferAiPersonalPuzzleGeneration({ total: 1, active: 0 })).toBe(true);
    expect(shouldOfferAiPersonalPuzzleGeneration({ total: 4, active: 3 })).toBe(false);
    expect(shouldOfferAiPersonalPuzzleGeneration({ total: 0, active: 0 })).toBe(false);
  });
});
