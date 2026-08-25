import { describe, expect, it } from 'vitest';
import { veteranLegacy } from './combatVeteranLegacy.js';

describe('veteranLegacy', () => {
  it('no inventa veteranía sin servicio real', () => {
    expect(veteranLegacy({ stats: {} })).toMatchObject({ title: 'Sin bautismo de fuego', battles: 0 });
  });

  it('prioriza una hazaña de jefe real sobre métricas genéricas', () => {
    const legacy = veteranLegacy({
      stats: { battles: 14, survivals: 12, kills: 11, bossVictories: 2, bossFinishes: 1 },
      decorations: [],
    });
    expect(legacy.title).toBe('Verdugo de jefe');
    expect(legacy.reason).toContain('Remató 1 jefe');
  });

  it('expone la última condecoración usando su fecha real', () => {
    const legacy = veteranLegacy({
      stats: { battles: 10, survivals: 8, kills: 10 },
      decorations: [
        { id: 'baptism', earnedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'ace', earnedAt: '2026-02-01T00:00:00.000Z' },
      ],
    });
    expect(legacy.latestDecoration?.id).toBe('ace');
  });
});
