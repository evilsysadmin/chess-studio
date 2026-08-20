import { describe, expect, it } from 'vitest';
import { commentForEvent, detectNoteworthyMove } from './cpuCommentary.js';

function fenAfter(moves) {
  // Helper sin importar Chess aquí: posiciones conocidas mantienen los tests legibles.
  return moves;
}

describe('cpuCommentary', () => {
  it('detecta un mate ejecutado', () => {
    const event = detectNoteworthyMove(
      '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1',
      { from: 'f7', to: 'g7' },
    );
    expect(event?.type).toBe('MATE_FOUND');
  });

  it('detecta mate en una ignorado', () => {
    const event = detectNoteworthyMove(
      '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1',
      { from: 'f7', to: 'f6' },
    );
    expect(event?.type).toBe('MISSED_MATE');
  });

  it('detecta un peón que captura una dama', () => {
    const event = detectNoteworthyMove(
      '4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1',
      { from: 'e4', to: 'd5' },
    );
    expect(event?.type).toBe('PAWN_TAKES_QUEEN');
  });


  it('las personalidades cambian el tono sin cambiar el evento', () => {
    const event = { type: 'MISSED_MATE' };
    const gentleman = commentForEvent(event, 'human', 'gentleman');
    const hal = commentForEvent(event, 'human', 'hal');
    const caster = commentForEvent(event, 'human', 'caster');
    expect(gentleman).toContain('Con todo respeto');
    expect(hal).toContain('Anomalía crítica');
    expect(caster).toContain('ATENCIÓN AL TABLERO');
  });

  it('no comenta una jugada normal de apertura', () => {
    const event = detectNoteworthyMove(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      { from: 'e2', to: 'e4' },
    );
    expect(event).toBeNull();
  });
});
