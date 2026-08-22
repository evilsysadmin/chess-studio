// STATIC CONTRACT: inspecciona wiring/markup/CSS deliberadamente; no sustituye tests de comportamiento.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.resolve(process.cwd(), 'src/components/ArmyScreen.jsx'), 'utf8');
const css = fs.readFileSync(path.resolve(process.cwd(), 'src/styles.css'), 'utf8');
const campaignSource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/RoguelikeScreen.jsx'), 'utf8');
const serviceSource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/CombatServicePanel.jsx'), 'utf8');

describe('roster visual completo de Combat Chess', () => {
  it('muestra los 16 slots canónicos, incluido el rey, y un barracón de tamaño dinámico', () => {
    expect(source).toContain('CANONICAL_ROSTER_SLOTS.map');
    expect(source).not.toContain("CANONICAL_ROSTER_SLOTS.filter((slot) => slot.type !== 'k')");
    expect(source).toContain('deploymentSummary(roster)');
    expect(source).toContain('deploy.totalRoster');
    expect(source).toContain('deploy.reserveCount');
    expect(source).toContain("isKing ? 'MANDO'");
  });

  it('hace el alias protagonista y abre un expediente por unidad', () => {
    expect(source).toContain('army-unit-alias');
    expect(source).toContain('const alias = unitAlias(roster, key)');
    expect(source).toContain('title={alias}');
    expect(source).toContain('<UnitDossier');
    expect(source).toContain('HOJA DE SERVICIO');
  });

  it('Campaña incrusta el roster completo en vez de enseñar sólo la hoja global', () => {
    expect(source).toContain('export function ArmyRosterPanel');
    expect(campaignSource).toContain('<ArmyRosterPanel');
    expect(campaignSource).toContain('embedded');
    expect(campaignSource).toContain('roster={roster}');
  });

  it('deja claro que Soldado/Cabo/etc es un rango global y no el alias de una unidad', () => {
    expect(serviceSource).toContain('Rango global de campaña');
    expect(serviceSource).toContain('no corresponde a ninguna unidad');
    expect(serviceSource).toContain('Orden de batalla');
  });

  it('usa tres filas legibles en escritorio y se adapta en móvil', () => {
    expect(css).toContain('grid-template-columns: repeat(6, minmax(0, 1fr));');
    expect(css).toContain('.army-roster-grid > :nth-child(13) { grid-column: 2; }');
    expect(css).toContain('grid-template-columns: repeat(4, minmax(0, 1fr));');
    expect(css).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
  });
});
