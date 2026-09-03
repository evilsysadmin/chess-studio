import { describe, expect, it } from 'vitest';
import { buildCombatHonoursModel } from './CombatHonoursRoom.jsx';

function record(overrides = {}) {
  return {
    identityId: overrides.identityId || 'u-1',
    alias: overrides.alias || 'Kurt',
    slotKey: overrides.slotKey || 'p-1',
    stats: {
      battles: 0,
      survivals: 0,
      kills: 0,
      bossVictories: 0,
      bossFinishes: 0,
      ...(overrides.stats || {}),
    },
    decorations: overrides.decorations || [],
  };
}

describe('CombatHonoursRoom', () => {
  it('no inventa una sala con trofeos cuando no hay servicio acreditado', () => {
    const model = buildCombatHonoursModel({ unitRecords: {}, memorial: [] });
    expect(model.hasHonours).toBe(false);
    expect(model.trophies).toEqual([]);
    expect(model.memorial).toEqual([]);
  });

  it('crea un trofeo de jefe sólo desde victorias reales del expediente', () => {
    const model = buildCombatHonoursModel({
      unitRecords: {
        one: record({ alias: 'Bruno', stats: { battles: 7, survivals: 6, kills: 3, bossVictories: 2, bossFinishes: 1 } }),
      },
      memorial: [],
    });
    expect(model.trophies[0]).toMatchObject({ id: 'boss-service', unitKey: 'p-1' });
    expect(model.trophies[0].detail).toContain('2 victorias contra jefe');
  });

  it('la vitrina cuenta condecoraciones reales de vivos y caídos', () => {
    const live = record({ decorations: [{ id: 'baptism', earnedAt: '2026-09-01T10:00:00.000Z' }] });
    const fallen = {
      ...record({ identityId: 'fallen-1', alias: 'Erika', decorations: [{ id: 'five_kills', earnedAt: '2026-09-02T10:00:00.000Z' }] }),
      permanentDeathAt: '2026-09-03T10:00:00.000Z',
      finalRankLabel: 'Cabo',
      finalLevel: 3,
      originType: 'p',
    };
    const model = buildCombatHonoursModel({ unitRecords: { one: live }, memorial: [fallen] });
    const cabinet = model.trophies.find((entry) => entry.id === 'decorations-cabinet');
    expect(cabinet).toBeTruthy();
    expect(cabinet.detail).toContain('2 condecoraciones');
    expect(model.memorial[0].alias).toBe('Erika');
  });

  it('limita el muro visible pero conserva el total real del memorial', () => {
    const memorial = Array.from({ length: 15 }, (_, index) => ({
      ...record({ identityId: `fallen-${index}`, alias: `Unidad ${index}` }),
      permanentDeathAt: '2026-09-03T10:00:00.000Z',
      originType: 'p',
    }));
    const model = buildCombatHonoursModel({ unitRecords: {}, memorial });
    expect(model.memorial).toHaveLength(12);
    expect(model.totalMemorial).toBe(15);
    expect(model.hasHonours).toBe(true);
  });
});
