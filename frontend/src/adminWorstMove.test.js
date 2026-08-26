import { describe, expect, it } from 'vitest';
import { buildWorstMoveAutopsy } from './adminWorstMove.js';

describe('admin worst move autopsy', () => {
  it('clasifica una dama comida por peón y reconstruye antes/después', () => {
    const payload = {
      gameHistory: [{
        id: 'g-crime',
        initialFen: '4k3/8/8/8/8/2p5/3Q4/4K3 w - - 0 1',
        humanColor: 'w',
        mode: 'casual',
        moves: [
          { san: 'Qb2', from: 'd2', to: 'b2', piece: 'q' },
          { san: 'cxb2', from: 'c3', to: 'b2', piece: 'p', captured: 'q', capturedPiece: 'q' },
        ],
      }],
      combatHistory: [],
    };
    const worst = {
      gameId: 'g-crime', index: 0, moveNumber: 1, played: 'Qb2', playedFrom: 'd2', playedTo: 'b2', playedPiece: 'q',
      suggested: 'Qe2', suggestedFrom: 'd2', suggestedTo: 'e2', suggestedPiece: 'q', loss: 100000, severity: 'blunder',
    };
    const detail = buildWorstMoveAutopsy(payload, worst);
    expect(detail.incident).toBe('Reina comida por peón');
    expect(detail.playedPiece).toBe('Dama');
    expect(detail.fenBefore).toContain(' w ');
    expect(detail.fenAfter).toContain(' b ');
    expect(detail.bestFen).toContain(' b ');
  });
});
