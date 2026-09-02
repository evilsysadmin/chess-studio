import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { buildPostGameExamPositions, POST_GAME_EXAM_LIMIT } from './postGameExam.js';

const history = [
  { san: 'e4', from: 'e2', to: 'e4' },
  { san: 'e5', from: 'e7', to: 'e5' },
  { san: 'Nf3', from: 'g1', to: 'f3' },
  { san: 'Nc6', from: 'b8', to: 'c6' },
  { san: 'Bc4', from: 'f1', to: 'c4' },
  { san: 'Nf6', from: 'g8', to: 'f6' },
  { san: 'd3', from: 'd2', to: 'd3' },
];

const report = {
  topMistakes: [
    { index: 2, moveNumber: 2, played: 'Nf3', suggested: 'Bc4', loss: 180 },
    { index: 4, moveNumber: 3, played: 'Bc4', suggested: 'Bb5', loss: 140 },
    { index: 6, moveNumber: 4, played: 'd3', suggested: 'Ng5', loss: 110 },
    { index: 6, moveNumber: 4, played: 'd3', suggested: 'O-O', loss: 60 },
  ],
};

describe('post-game exam', () => {
  it('reconstruye hasta tres posiciones críticas legales de la partida real', () => {
    const positions = buildPostGameExamPositions(history, 'w', report, { gameId: 'g-exam' });

    expect(positions).toHaveLength(POST_GAME_EXAM_LIMIT);
    expect(positions.map((item) => item.moveNumber)).toEqual([2, 3, 4]);
    expect(positions.every((item) => item.sourceGameId === 'g-exam')).toBe(true);
    for (const position of positions) {
      const board = new Chess(position.fen);
      expect(board.turn()).toBe('w');
      expect(() => board.move(position.solution[0])).not.toThrow();
    }
  });

  it('descarta posiciones por debajo del umbral y respeta un límite menor', () => {
    const positions = buildPostGameExamPositions(history, 'w', report, {}, { limit: 2 });
    expect(positions).toHaveLength(2);
    expect(positions.every((item) => item.loss >= 80)).toBe(true);
    expect(positions.some((item) => item.suggested === 'O-O')).toBe(false);
  });

  it('no crea examen cuando la autopsia no aporta errores entrenables', () => {
    expect(buildPostGameExamPositions(history, 'w', {
      topMistakes: [{ index: 2, played: 'Nf3', suggested: 'Bc4', loss: 45 }],
    })).toEqual([]);
  });
});
