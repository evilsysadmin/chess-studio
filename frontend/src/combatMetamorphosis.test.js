import { describe, expect, it } from 'vitest';
import {
  applyRosterMetamorphosesToPosition,
  deploymentUnlockStatus,
  setRosterDeploymentType,
  unlockedDeploymentTypes,
} from './combatMetamorphosis.js';

const commanderPawn = { strengthPoints: 4, speedPoints: 3, bankedXp: 4, alive: true }; // nivel 8
const colonelPawn = { strengthPoints: 5, speedPoints: 4, bankedXp: 4, alive: true }; // nivel 10
const generalPawn = { strengthPoints: 6, speedPoints: 5, bankedXp: 4, alive: true }; // nivel 12

function record(stats = {}) {
  return {
    identityId: 'unit-rivas', alias: 'Rivas', slotKey: 'p-a', originType: 'p',
    stats: {
      battles: 0, survivals: 0, kills: 0, bestSurvivalStreak: 0, bossVictories: 0,
      ...stats,
    },
    decorations: [],
  };
}

function roster(saved, unitRecord) {
  return {
    pieces: { 'p-a': saved },
    identities: { 'p-a': { alias: 'Rivas', identityId: 'unit-rivas', createdAt: '2026-08-01T00:00:00.000Z' } },
    unitRecords: { 'unit-rivas': unitRecord },
    memorial: [], unitServiceProcessedBattleIds: [], combatXp: 12, revivesUsed: 0,
  };
}

describe('metamorfosis táctica de Combate', () => {
  it('exige rango Y servicio real: no basta con farmear nivel', () => {
    expect(unlockedDeploymentTypes('p-a', commanderPawn, record({ survivals: 2 }))).toEqual(['p']);
    expect(unlockedDeploymentTypes('p-a', commanderPawn, record({ survivals: 3 }))).toEqual(['p', 'n']);

    expect(unlockedDeploymentTypes('p-a', colonelPawn, record({ survivals: 8, kills: 5, bestSurvivalStreak: 4 }))).toEqual(['p', 'n']);
    expect(unlockedDeploymentTypes('p-a', colonelPawn, record({ survivals: 8, kills: 5, bestSurvivalStreak: 5 }))).toEqual(['p', 'n', 'b']);

    expect(unlockedDeploymentTypes('p-a', generalPawn, record({ battles: 12, survivals: 8, kills: 8, bestSurvivalStreak: 5, bossVictories: 0 }))).toEqual(['p', 'n', 'b']);
    expect(unlockedDeploymentTypes('p-a', generalPawn, record({ battles: 12, survivals: 8, kills: 8, bestSurvivalStreak: 5, bossVictories: 1 }))).toEqual(['p', 'n', 'b', 'r']);
    expect(unlockedDeploymentTypes('n-b', generalPawn, record({ battles: 99, survivals: 99 }))).toEqual(['n']);
  });

  it('expone progreso legible del siguiente requisito', () => {
    const statuses = deploymentUnlockStatus('p-a', colonelPawn, record({ survivals: 6, kills: 3, bestSurvivalStreak: 2 }));
    const bishop = statuses.find((status) => status.type === 'b');
    expect(bishop).toMatchObject({ unlocked: false, rankMet: true, serviceMet: false, rankLabel: 'Coronel' });
    expect(bishop.progressLabel).toContain('3/5 bajas');
    expect(bishop.progressLabel).toContain('2/5 racha');
  });

  it('permite cambiar el loadout antes de cada batalla sólo cuando el expediente lo acredita', () => {
    const service = record({ battles: 12, survivals: 8, kills: 8, bestSurvivalStreak: 5, bossVictories: 1 });
    const base = roster(generalPawn, service);
    const knight = setRosterDeploymentType(base, 'p-a', 'n');
    expect(knight.pieces['p-a'].deploymentType).toBe('n');
    const bishop = setRosterDeploymentType(knight, 'p-a', 'b');
    expect(bishop.pieces['p-a'].deploymentType).toBe('b');
    const rook = setRosterDeploymentType(bishop, 'p-a', 'r');
    expect(rook.pieces['p-a'].deploymentType).toBe('r');
    const original = setRosterDeploymentType(rook, 'p-a', 'p');
    expect(original.pieces['p-a'].deploymentType).toBeNull();
  });

  it('rechaza una forma aunque el rango alcance si falta historial de servicio', () => {
    const base = roster(generalPawn, record({ battles: 20, survivals: 12, kills: 12, bestSurvivalStreak: 6, bossVictories: 0 }));
    expect(setRosterDeploymentType(base, 'p-a', 'r')).toBe(base);
  });

  it('cambia la clase del tablero pero conserva id e identidad de origen', () => {
    const board = new Map([['a2', { type: 'p', color: 'w' }]]);
    const chess = {
      get: (sq) => board.get(sq) || null,
      remove: (sq) => { const old = board.get(sq); board.delete(sq); return old; },
      put: (piece, sq) => { board.set(sq, piece); return true; },
    };
    const registry = { a2: { id: 'w-p-a2', type: 'p', color: 'w', square: 'a2', alias: 'Rivas' } };
    const service = record({ survivals: 8, kills: 5, bestSurvivalStreak: 5 });
    const base = roster({ ...colonelPawn, deploymentType: 'b' }, service);
    const next = applyRosterMetamorphosesToPosition(chess, registry, base, 'w');
    expect(board.get('a2')).toEqual({ type: 'b', color: 'w' });
    expect(next.a2).toMatchObject({ id: 'w-p-a2', type: 'b', deploymentType: 'b', alias: 'Rivas' });
  });

  it('ignora loadouts antiguos que ya no cumplen los nuevos requisitos de servicio', () => {
    const board = new Map([['a2', { type: 'p', color: 'w' }]]);
    const chess = {
      get: (sq) => board.get(sq) || null,
      remove: (sq) => { const old = board.get(sq); board.delete(sq); return old; },
      put: (piece, sq) => { board.set(sq, piece); return true; },
    };
    const registry = { a2: { id: 'w-p-a2', type: 'p', color: 'w', square: 'a2' } };
    const base = roster({ ...generalPawn, deploymentType: 'r' }, record({ battles: 20, survivals: 10, bossVictories: 0 }));
    const next = applyRosterMetamorphosesToPosition(chess, registry, base, 'w');
    expect(board.get('a2')).toEqual({ type: 'p', color: 'w' });
    expect(next.a2.type).toBe('p');
  });
});
