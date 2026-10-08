import { describe, expect, it } from 'vitest';
import { buildLiveShareRecord, encodeShareRecord, decodeShareRecord, buildShareText, countFullMoves } from './shareResult.js';

describe('partidas compartidas', () => {
  const record = {
    outcome: 'win', difficulty: 70, humanColor: 'w', mode: 'casual',
    moves: [{ san: 'e4' }, { san: 'c5' }, { san: 'Nf3' }],
    timeControl: { id: '3+2', label: '3 min + 2s' },
  };

  it('construye el snapshot live sin depender de estado de App', () => {
    const live = buildLiveShareRecord(
      { id: 'g-7', difficulty: 55, humanColor: 'b', fen: 'fen-final', history: [{ san: 'e4' }, { san: 'c5' }] },
      'loss',
      'casual',
      { id: 's-1', bestOf: 3, humanWins: 1, cpuWins: 2, draws: 0, winner: 'cpu' },
      { id: '10+0', label: '10 min' },
    );
    expect(live).toMatchObject({
      id: 'share-g-7',
      difficulty: 55,
      humanColor: 'b',
      outcome: 'loss',
      finalFen: 'fen-final',
      mode: 'casual',
      timeControl: { id: '10+0', label: '10 min' },
      series: { id: 's-1', bestOf: 3, humanWins: 1, cpuWins: 2, draws: 0, winner: 'cpu' },
    });
    expect(live.moves).toEqual([{ san: 'e4' }, { san: 'c5' }]);
  });

  it('codifica y decodifica sin datos de sesión', () => {
    const decoded = decodeShareRecord(encodeShareRecord(record));
    expect(decoded.outcome).toBe('win');
    expect(decoded.moves).toEqual(['e4', 'c5', 'Nf3']);
    expect(JSON.stringify(decoded)).not.toContain('token');
  });

  it('cuenta jugadas completas en el resumen, no medias jugadas', () => {
    expect(countFullMoves(record.moves)).toBe(2);
    expect(countFullMoves([{ san: 'e4' }, { san: 'e5' }])).toBe(1);
    expect(countFullMoves([])).toBe(0);
    expect(countFullMoves([{ san: 'e4' }])).toBe(1);
    expect(countFullMoves([{ san: 'e4' }, { san: 'e5' }, { san: 'Nf3' }, { san: 'Nc6' }])).toBe(2);
    expect(buildShareText(record)).toContain('2 jugadas');
  });

  it('genera un resumen para presumir', () => {
    const text = buildShareText(record);
    expect(text).toContain('Victoria');
    expect(text).toContain('nivel 70');
  });
});
