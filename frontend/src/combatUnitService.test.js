import { describe, it, expect } from 'vitest';
import {
  ensureUnitServiceState,
  recordUnitBattle,
  recordUnitRevive,
  archivePermanentCasualty,
  unitRecordForKey,
  unitDecorations,
} from './combatUnitService.js';

function baseRoster() {
  return {
    pieces: {
      'p-a': { strengthPoints: 5, speedPoints: 4, bankedXp: 0, alive: true },
    },
    identities: {
      'p-a': { alias: 'Rivas', identityId: 'unit-rivas', createdAt: '2026-08-01T00:00:00.000Z' },
      'k-e': { alias: 'Majestad', identityId: 'unit-king', createdAt: '2026-08-01T00:00:00.000Z' },
    },
    unitRecords: {},
    memorial: [],
    unitServiceProcessedBattleIds: [],
    combatXp: 0,
  };
}

describe('expediente individual de Combate', () => {
  it('crea expediente para cada identidad militar activa, pero no para el rey', () => {
    const state = ensureUnitServiceState(baseRoster(), Date.parse('2026-08-21T10:00:00.000Z'));
    expect(state.unitRecords['unit-rivas']).toMatchObject({ alias: 'Rivas', slotKey: 'p-a', originType: 'p' });
    expect(state.unitRecords['unit-king']).toBeUndefined();
    expect(ensureUnitServiceState(state)).toBe(state); // sin escrituras fantasma si ya está normalizado
  });

  it('registra batallas, bajas, supervivencia, boss y es idempotente por battleId', () => {
    const state = ensureUnitServiceState(baseRoster());
    const event = {
      battleId: 'battle-1',
      date: '2026-08-21T12:00:00.000Z',
      outcome: 'win',
      participants: [{ identityId: 'unit-rivas', alias: 'Rivas', slotKey: 'p-a' }],
      survivorIdentityIds: ['unit-rivas'],
      killsByIdentity: { 'unit-rivas': 5 },
      bossDamageByIdentity: { 'unit-rivas': 2 },
      bossFinisherIdentityId: 'unit-rivas',
      bossDefeated: true,
    };
    const once = recordUnitBattle(state, event);
    const twice = recordUnitBattle(once, event);
    const record = unitRecordForKey(twice, 'p-a');
    expect(record.stats).toMatchObject({ battles: 1, wins: 1, survivals: 1, kills: 5, bossDamage: 2, bossVictories: 1, bossFinishes: 1, bestSurvivalStreak: 1 });
    expect(unitDecorations(record).map((m) => m.id)).toEqual(expect.arrayContaining(['baptism', 'five_kills', 'boss_survivor']));
  });

  it('una baja corta la racha y conserva la fecha real de muerte', () => {
    const state = recordUnitBattle(ensureUnitServiceState(baseRoster()), {
      battleId: 'battle-death',
      date: '2026-08-21T13:00:00.000Z',
      outcome: 'loss',
      participants: [{ identityId: 'unit-rivas', alias: 'Rivas', slotKey: 'p-a' }],
      survivorIdentityIds: [],
    });
    const record = unitRecordForKey(state, 'p-a');
    expect(record.stats.deaths).toBe(1);
    expect(record.stats.currentSurvivalStreak).toBe(0);
    expect(record.stats.lastDeathAt).toBe('2026-08-21T13:00:00.000Z');
  });

  it('revivir mantiene la identidad y suma una resurrección al expediente', () => {
    const state = recordUnitRevive(ensureUnitServiceState(baseRoster()), 'p-a', '2026-08-21T14:00:00.000Z');
    expect(unitRecordForKey(state, 'p-a').stats.revives).toBe(1);
  });

  it('la muerte permanente mueve el expediente al Memorial con rango final y lo saca de activos', () => {
    let state = ensureUnitServiceState(baseRoster());
    state = recordUnitBattle(state, {
      battleId: 'battle-last',
      date: '2026-08-21T15:00:00.000Z',
      outcome: 'loss',
      participants: [{ identityId: 'unit-rivas', alias: 'Rivas', slotKey: 'p-a' }],
      survivorIdentityIds: [],
      killsByIdentity: { 'unit-rivas': 3 },
    });
    state = { ...state, pieces: { ...state.pieces, 'p-a': { ...state.pieces['p-a'], alive: false } } };
    const archived = archivePermanentCasualty(state, 'p-a', '2026-08-21T16:00:00.000Z');
    expect(archived.unitRecords['unit-rivas']).toBeUndefined();
    expect(archived.memorial).toHaveLength(1);
    expect(archived.memorial[0]).toMatchObject({ alias: 'Rivas', finalLevel: 10, finalRankLabel: 'Coronel' });
    expect(archived.memorial[0].stats).toMatchObject({ battles: 1, deaths: 1, kills: 3 });
  });
});
