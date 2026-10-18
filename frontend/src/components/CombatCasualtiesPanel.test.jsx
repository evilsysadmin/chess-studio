import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import CombatCasualtiesPanel from './CombatCasualtiesPanel.jsx';

function renderCasualties(roster, fallenKeys = Object.keys(roster.pieces)) {
  return renderToStaticMarkup(<CombatCasualtiesPanel
    roster={roster} fallenKeys={fallenKeys}
    selectedUnitKey={null} activeDossierKey={null}
    onPreviewDossier={() => {}} onHideDossier={() => {}}
    onPinDossier={() => {}} onRevive={() => {}}
    onReplace={() => {}} onAfterDecision={() => {}}
  />);
}

describe('Combat Chess · decisiones de bajas', () => {
  it('muestra solo la carrera registrada, el coste y el nivel resultante exacto', () => {
    const html = renderCasualties({
      credits: 60,
      pieces: { 'n-b': { alive: false, strengthPoints: 4, speedPoints: 2, bankedXp: 3 } },
      identities: { 'n-b': { identityId: 'unit-konrad', alias: 'Konrad' } },
      unitRecords: { 'unit-konrad': {
        identityId: 'unit-konrad', alias: 'Konrad',
        stats: { battles: 11, survivals: 8, kills: 4 },
        decorations: [{ id: 'veteran' }],
      } },
    });
    expect(html).toContain('Konrad');
    expect(html).toContain('11 batallas');
    expect(html).toContain('8 supervivencias');
    expect(html).toContain('4 bajas enemigas');
    expect(html).toContain('1 condecoración');
    expect(html).toContain('nv.7 → nv.4');
    expect(html).toContain('una batalla de recuperación');
    expect(html).not.toContain('Confirmar reemplazo definitivo');
    expect(html).not.toContain('Aceptar 2 reclutas');
  });

  it('no inventa historial, ni permite revivir a reclutas sin puntos invertidos', () => {
    const html = renderCasualties({
      credits: 100,
      pieces: { 'p-a': { alive: false, strengthPoints: 0, speedPoints: 0 } },
      identities: { 'p-a': { identityId: 'unit-new', alias: 'Lino' } },
      unitRecords: {},
    });
    expect(html).toContain('Lino');
    expect(html).toContain('Sin mejoras invertidas');
    expect(html).not.toContain('0 batallas');
    expect(html).toMatch(/disabled[^>]*>Revivir/);
    expect(html).toContain('Reemplazar…');
  });

  it('explica cuándo faltan créditos sin habilitar la recuperación', () => {
    const html = renderCasualties({
      credits: 0,
      pieces: { 'r-a': { alive: false, strengthPoints: 3, speedPoints: 1 } },
      identities: { 'r-a': { identityId: 'unit-rook', alias: 'Bruno' } },
    });
    expect(html).toMatch(/Faltan \d+ cr para revivir/);
    expect(html).toMatch(/disabled[^>]*>Revivir/);
  });
});
