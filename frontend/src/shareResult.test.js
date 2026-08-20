import { describe, expect, it } from 'vitest';
import { encodeShareRecord, decodeShareRecord, buildShareText } from './shareResult.js';

describe('partidas compartidas', () => {
  const record = {
    outcome: 'win', difficulty: 70, humanColor: 'w', mode: 'casual',
    moves: [{ san: 'e4' }, { san: 'c5' }, { san: 'Nf3' }],
    timeControl: { id: '3+2', label: '3 min + 2s' },
  };

  it('codifica y decodifica sin datos de sesión', () => {
    const decoded = decodeShareRecord(encodeShareRecord(record));
    expect(decoded.outcome).toBe('win');
    expect(decoded.moves).toEqual(['e4', 'c5', 'Nf3']);
    expect(JSON.stringify(decoded)).not.toContain('token');
  });

  it('genera un resumen para presumir', () => {
    const text = buildShareText(record);
    expect(text).toContain('Victoria');
    expect(text).toContain('nivel 70');
  });
});
