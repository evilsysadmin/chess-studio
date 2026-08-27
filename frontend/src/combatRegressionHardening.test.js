import { beforeEach, describe, expect, it } from 'vitest';

import { canReturnCombatToSetup, clearCombatSession, hasCombatSession, loadCombatSession, saveCombatSession } from './combatSession.js';
import { ensureCombatIdentities } from './combatIdentity.js';
import { expireDeadPieces, loadRoster } from './combatRoster.js';
import {
  deploymentSummary,
  ensureDeploymentState,
  grantReserveRecruit,
  isDeploymentReadyForBattle,
  removeDeploymentUnit,
  setDeploymentUnit,
} from './combatDeployment.js';

const AFTER_E4_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const AFTER_D4_FEN = 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  clearCombatSession();
});

describe('REGRESSION · una batalla Combat viva jamás cae silenciosamente a Setup', () => {
  it('bloquea battle → setup en campaña/roguelike y permite salidas fuera de batalla', () => {
    expect(canReturnCombatToSetup({ phase: 'battle', combatVariant: 'roguelike' })).toBe(false);
    expect(canReturnCombatToSetup({ phase: 'over', combatVariant: 'roguelike' })).toBe(true);
    expect(canReturnCombatToSetup({ phase: 'setup', combatVariant: 'roguelike' })).toBe(true);
    expect(canReturnCombatToSetup({ phase: 'battle', combatVariant: 'free' })).toBe(true);
  });

  it('una sesión activa sobrevive a storage corrupto durante un remount', () => {
    const id = 'campaign:regression:n3';
    saveCombatSession(id, { phase: 'battle', fen: AFTER_E4_FEN, registry: { e4: { type: 'p' } }, humanColor: 'w' });
    sessionStorage.setItem('chess-study-active-combat-session-v1', '{roto');
    expect(hasCombatSession(id)).toBe(true);
    expect(loadCombatSession(id)).toMatchObject({ phase: 'battle', fen: AFTER_E4_FEN, humanColor: 'w' });
  });
  it('campaña y combate libre pueden quedar suspendidos sin pisarse entre sí', () => {
    const campaignId = 'campaign:seed:s3-battle';
    const freeId = 'free';
    saveCombatSession(campaignId, { phase: 'battle', fen: AFTER_E4_FEN, registry: { e4: { type: 'p' } }, humanColor: 'w' });
    saveCombatSession(freeId, { phase: 'battle', fen: AFTER_D4_FEN, registry: { d4: { type: 'p' } }, humanColor: 'b' });

    expect(loadCombatSession(campaignId)).toMatchObject({ fen: AFTER_E4_FEN, humanColor: 'w' });
    expect(loadCombatSession(freeId)).toMatchObject({ fen: AFTER_D4_FEN, humanColor: 'b' });

    clearCombatSession(freeId);
    expect(loadCombatSession(freeId)).toBeNull();
    expect(loadCombatSession(campaignId)).toMatchObject({ fen: AFTER_E4_FEN });
  });

});

describe('REGRESSION · identidad histórica y Memorial son inmutables', () => {
  it('migrar aliases activos no reescribe el nombre archivado de un caído', () => {
    const state = {
      pieces: { 'p-a': { strengthPoints: 1, speedPoints: 0, alive: true } },
      identities: { 'p-a': { identityId: 'active-starky', alias: 'Starky' } },
      unitRecords: { 'active-starky': { identityId: 'active-starky', alias: 'Starky', stats: {} } },
      memorial: [{ identityId: 'fallen-dusty', alias: 'Dusty', finalLevel: 6, finalRankLabel: 'Capitán' }],
    };
    const migrated = ensureCombatIdentities(state, () => 0, 1000);
    expect(migrated.identities['p-a'].alias).not.toBe('Starky');
    expect(migrated.memorial).toEqual(state.memorial);
    expect(migrated.memorial[0].alias).toBe('Dusty');
  });

  it('una baja definitiva conserva su alias de servicio y el reemplazo recibe identityId nuevo', () => {
    const roster = {
      pieces: { 'p-a': { strengthPoints: 3, speedPoints: 2, bankedXp: 0, alive: false } },
      identities: { 'p-a': { alias: 'Starky', identityId: 'old-starky' } },
      combatXp: 0,
    };
    const expired = expireDeadPieces(roster, '2026-08-23T06:00:00.000Z');
    expect(expired.memorial).toHaveLength(1);
    expect(expired.memorial[0]).toMatchObject({ identityId: 'old-starky', alias: 'Starky' });
    expect(expired.identities['p-a'].identityId).not.toBe('old-starky');
  });
});

describe('REGRESSION · bajas, reemplazos y formación incompleta', () => {
  it('dos bajas siguen visibles como pendientes y al reemplazarlas vuelven como dos reservas nuevas', () => {
    let roster = loadRoster();
    roster = {
      ...roster,
      pieces: {
        ...roster.pieces,
        'p-a': { strengthPoints: 0, speedPoints: 0, bankedXp: 0, alive: false },
        'p-f': { strengthPoints: 0, speedPoints: 0, bankedXp: 0, alive: false },
      },
    };
    roster = ensureDeploymentState(roster);
    expect(deploymentSummary(roster)).toMatchObject({ assignedCount: 14, fallenCount: 2, totalIdentities: 16 });

    const replaced = expireDeadPieces(roster, '2026-08-23T06:30:00.000Z');
    expect(deploymentSummary(replaced)).toMatchObject({ assignedCount: 16, reserveCount: 0, fallenCount: 0, totalRoster: 16 });
  });

  it('quitar una unidad deja formación incompleta aunque el estado se normalice otra vez', () => {
    let roster = loadRoster();
    roster = removeDeploymentUnit(roster, 'p-a');
    roster = ensureDeploymentState(roster);
    expect(deploymentSummary(roster).assignedCount).toBe(15);
    expect(isDeploymentReadyForBattle(roster)).toBe(false);
  });

  it('16 slots cubiertos NO permiten confirmar mientras quede una baja pendiente', () => {
    let roster = loadRoster();
    roster = grantReserveRecruit(roster, { grantId: 'regression:reserve', originType: 'p', rng: () => 0.42, now: 4242 });
    const reserveKey = deploymentSummary(roster).reserveKeys[0];
    roster = {
      ...roster,
      pieces: {
        ...roster.pieces,
        'p-a': { ...roster.pieces['p-a'], strengthPoints: 2, speedPoints: 1, alive: false },
      },
    };
    roster = ensureDeploymentState(roster);
    roster = setDeploymentUnit(roster, 'p-a', reserveKey);
    const summary = deploymentSummary(roster);
    expect(summary.ready).toBe(true);
    expect(summary.assignedCount).toBe(16);
    expect(summary.fallenCount).toBe(1);
    expect(isDeploymentReadyForBattle(roster)).toBe(false);
  });
});
