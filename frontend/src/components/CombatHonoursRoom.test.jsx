import { describe, expect, it } from 'vitest';
import { buildCombatHonoursModel } from './CombatHonoursRoom.jsx';

// A visual trophy is not allowed to exist unless the service record proves it.
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
    expect(model.visualContract).toBe('architectural-hall-v2');
  });

  it('crea un trofeo de jefe sólo desde victorias reales del expediente', () => {
    const model = buildCombatHonoursModel({
      unitRecords: {
        one: record({ alias: 'Bruno', stats: { battles: 7, survivals: 6, kills: 3, bossVictories: 2, bossFinishes: 1 } }),
      },
      memorial: [],
    });
    expect(model.trophies[0]).toMatchObject({ id: 'boss-service', unitKey: 'p-1', artifact: 'crown' });
    expect(model.trophies[0].detail).toContain('2 victorias contra jefe');
    expect(model.roomMood).toBe('honours');
  });

  it('diferencia visualmente hoja de acero y vitrina sin cambiar su provenance', () => {
    const ace = record({
      identityId: 'ace-1',
      alias: 'Hanna',
      slotKey: 'n-1',
      stats: { battles: 9, survivals: 8, kills: 11 },
    });
    const decorated = record({
      identityId: 'decorated-1',
      alias: 'Otto',
      slotKey: 'p-2',
      decorations: [{ id: 'baptism', earnedAt: '2026-09-01T10:00:00.000Z' }],
    });
    const model = buildCombatHonoursModel({ unitRecords: { ace, decorated }, memorial: [] });
    expect(model.trophies.find((entry) => entry.id === 'ace-service')).toMatchObject({ artifact: 'crossed-blades', unitKey: 'n-1' });
    expect(model.trophies.find((entry) => entry.id === 'decorations-cabinet')).toMatchObject({ artifact: 'medal-cabinet', unitKey: null });
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
    expect(cabinet.artifact).toBe('medal-cabinet');
    expect(model.memorial[0].alias).toBe('Erika');
    expect(model.roomMood).toBe('honours-and-memorial');
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
    expect(model.roomMood).toBe('memorial');
  });
});
