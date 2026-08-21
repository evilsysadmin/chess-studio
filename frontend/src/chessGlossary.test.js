import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
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

  it('está integrado en Tutorial y ofrece mini glosario en la autopsia', () => {
    const tutorial = fs.readFileSync(path.resolve(process.cwd(), 'src/components/Tutorial.jsx'), 'utf8');
    const report = fs.readFileSync(path.resolve(process.cwd(), 'src/components/GameReportModal.jsx'), 'utf8');
    expect(tutorial).toContain('<ChessGlossary />');
    expect(tutorial).toContain('Glosario');
    expect(report).toContain('Glosario rápido · cp / CCT');
  });

  it('ofrece ayuda contextual reutilizable por hover, focus y tap en pantallas reales', () => {
    const tooltip = fs.readFileSync(path.resolve(process.cwd(), 'src/components/GlossaryTerm.jsx'), 'utf8');
    const report = fs.readFileSync(path.resolve(process.cwd(), 'src/components/GameReportModal.jsx'), 'utf8');
    const lab = fs.readFileSync(path.resolve(process.cwd(), 'src/components/LabScreen.jsx'), 'utf8');
    const quick = fs.readFileSync(path.resolve(process.cwd(), 'src/components/QuickMatchModal.jsx'), 'utf8');
    expect(tooltip).toContain('role="tooltip"');
    expect(tooltip).toContain('tabIndex={0}');
    expect(tooltip).toContain('onClick');
    expect(tooltip).toContain("event.key === 'Escape'");
    expect(report).toContain('<GlossaryTerm term="cp">cp</GlossaryTerm>');
    expect(report).toContain('<GlossaryTerm term="Accuracy">Accuracy</GlossaryTerm>');
    expect(lab).toContain('<GlossaryTerm term="FEN">FEN</GlossaryTerm>');
    expect(quick).toContain('<GlossaryTerm term="CCT">CCT</GlossaryTerm>');
  });
});
