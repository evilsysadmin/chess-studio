import { describe, expect, it } from 'vitest';
import { CHESS_GLOSSARY, glossaryEntry, glossarySearch } from './chessGlossary.js';

describe('glosario ajedrecístico', () => {
  it('explica cp y CCT, los dos términos que más aparecen en consejos/autopsias', () => {
    expect(glossaryEntry('cp')?.definition).toContain('100 cp');
    expect(glossaryEntry('CCT')?.definition).toContain('Jaques');
    expect(glossaryEntry('CCT')?.definition).toContain('Capturas');
    expect(glossaryEntry('CCT')?.definition).toContain('Amenazas');
  });

  it('permite buscar por término, alias y definición', () => {
    expect(glossarySearch('centipeón').some((entry) => entry.term === 'cp')).toBe(true);
    expect(glossaryEntry('centipawns')?.term).toBe('cp');
    expect(glossarySearch('fork').some((entry) => entry.term === 'Tenedor')).toBe(true);
    expect(glossarySearch('posición concreta').some((entry) => entry.term === 'FEN')).toBe(true);
  });

  it('no es un glosario testimonial y todos los términos tienen tooltip corto', () => {
    expect(CHESS_GLOSSARY.length).toBeGreaterThanOrEqual(18);
    for (const entry of CHESS_GLOSSARY) {
      expect(entry.tooltip?.length).toBeGreaterThan(15);
      expect(entry.tooltip?.length).toBeLessThanOrEqual(180);
    }
  });


});
