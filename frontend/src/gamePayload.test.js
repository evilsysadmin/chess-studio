import { describe, expect, it } from 'vitest';
import { gamePayloadIssues, requireGamePayload } from './gamePayload.js';

const payload = () => ({
  id: 'g-1',
  fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
  turn: 'b',
  humanColor: 'w',
  difficulty: 50,
  status: 'playing',
  isGameOver: false,
  history: [{ san: 'e4', from: 'e2', to: 'e4', piece: 'p', captured: false, capturedPiece: null, promotion: null }],
  lastMove: { from: 'e2', to: 'e4', by: 'human', piece: 'p', captured: false, promotion: null },
});

describe('contrato de respuestas de partida', () => {
  it('acepta una foto coherente del backend', () => {
    const value = payload();
    expect(gamePayloadIssues(value, 'g-1')).toEqual([]);
    expect(requireGamePayload(value, 'g-1')).toBe(value);
  });

  it('rechaza identidad, FEN/turno e historial incoherentes antes de tocar React', () => {
    expect(gamePayloadIssues({ ...payload(), id: 'otra' }, 'g-1')).toContain('identity');
    expect(gamePayloadIssues({ ...payload(), fen: 'fen-roto' })).toContain('fen');
    expect(gamePayloadIssues({ ...payload(), turn: 'w' })).toContain('turn-fen');
    expect(gamePayloadIssues({ ...payload(), history: [null] })).toContain('history:0');
    expect(() => requireGamePayload(null, 'g-1')).toThrow(/partida incoherente/i);
  });
});
