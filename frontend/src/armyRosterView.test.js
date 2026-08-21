import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.resolve(process.cwd(), 'src/components/ArmyScreen.jsx'), 'utf8');
const css = fs.readFileSync(path.resolve(process.cwd(), 'src/styles.css'), 'utf8');

describe('roster visual completo de Combat Chess', () => {
  it('muestra los 16 slots, incluido el rey, sin filtrar reclutas sin progreso', () => {
    expect(source).toContain('CANONICAL_ROSTER_SLOTS.map');
    expect(source).not.toContain("CANONICAL_ROSTER_SLOTS.filter((slot) => slot.type !== 'k')");
    expect(source).toContain('16 unidades');
    expect(source).toContain("isKing ? 'MANDO'");
  });

  it('hace el alias protagonista y abre un expediente por unidad', () => {
    expect(source).toContain('army-unit-alias');
    expect(source).toContain('unitAlias(roster, key)');
    expect(source).toContain('<UnitDossier');
    expect(source).toContain('HOJA DE SERVICIO');
  });

  it('usa formación de ocho columnas en escritorio y se adapta en móvil', () => {
    expect(css).toContain('grid-template-columns: repeat(8, minmax(0, 1fr));');
    expect(css).toContain('grid-template-columns: repeat(4, minmax(0, 1fr));');
    expect(css).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
  });
});
