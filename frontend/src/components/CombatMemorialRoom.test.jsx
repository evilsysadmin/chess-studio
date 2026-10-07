import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import CombatMemorialRoom from './CombatMemorialRoom.jsx';

function fallen(overrides = {}) {
  return {
    identityId: 'fallen-1',
    alias: 'Hilde',
    originType: 'n',
    finalRankLabel: 'Sargento',
    finalLevel: 5,
    permanentDeathAt: '2026-10-01T12:00:00.000Z',
    lastBattleAt: '2026-10-01T11:00:00.000Z',
    stats: { battles: 9, survivals: 7, kills: 4, bossDamage: 2, revives: 1 },
    decorations: [],
    ...overrides,
  };
}

describe('CombatMemorialRoom', () => {
  it('proyecta identidades archivadas reales sin inventar progreso', () => {
    const html = renderToStaticMarkup(<CombatMemorialRoom roster={{ memorial: [fallen()] }} onClose={() => {}} />);
    expect(html).toContain('Memorial');
    expect(html).toContain('Hilde');
    expect(html).toContain('Sargento');
    expect(html).toContain('Caballo');
    expect(html).toContain('9 bat.');
    expect(html).toContain('Archivo permanente');
  });

  it('explica el estado vacío sin fingir caídos', () => {
    const html = renderToStaticMarkup(<CombatMemorialRoom roster={{ memorial: [] }} onClose={() => {}} />);
    expect(html).toContain('Aún no hay nombres en el muro.');
    expect(html).not.toContain('data-memorial-entry=');
  });
});
