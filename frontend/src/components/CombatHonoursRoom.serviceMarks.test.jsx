import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import CombatHonoursRoom, { buildCombatHonoursModel } from './CombatHonoursRoom.jsx';
import { unitServiceMarks } from '../combatUnitService.js';

function memorialEntry(overrides = {}) {
  return {
    identityId: 'unit-rivas',
    alias: 'Rivas',
    slotKey: 'p-a',
    originType: 'p',
    finalLevel: 4,
    finalRankLabel: 'Cabo',
    permanentDeathAt: '2026-09-10T10:00:00.000Z',
    stats: { battles: 8, survivals: 5, kills: 4, bossDamage: 0, revives: 1 },
    decorations: [],
    ...overrides,
  };
}

describe('Combat service scars', () => {
  it('derives a revival scar only from an actual recorded revive', () => {
    expect(unitServiceMarks({ stats: { battles: 30, kills: 20, bossVictories: 3, revives: 0 } })).toEqual([]);
    expect(unitServiceMarks({ stats: { revives: 1 } })).toEqual([
      expect.objectContaining({
        id: 'revival-scar',
        label: 'Cicatriz de retorno',
        count: 1,
        provenance: '1 revival registrado',
      }),
    ]);
  });

  it('preserves the factual scar in the Memorial dossier', () => {
    const roster = { memorial: [memorialEntry()], unitRecords: {} };
    const model = buildCombatHonoursModel(roster);
    expect(model.memorial[0].serviceMarksResolved).toEqual([
      expect.objectContaining({ id: 'revival-scar', count: 1 }),
    ]);

    const html = renderToStaticMarkup(<CombatHonoursRoom roster={roster} />);
    expect(html).toContain('data-service-mark="revival-scar"');
    expect(html).toContain('Cicatriz de retorno');
    expect(html).toContain('1 revival registrado');
  });
});
