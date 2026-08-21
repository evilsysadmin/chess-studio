import { describe, expect, it } from 'vitest';
import { balancedCombatDifficulty, combatArmyThreat } from './combatBalance.js';

function service(identityId, stats = {}) {
  return {
    identityId,
    stats: {
      battles: 0, survivals: 0, kills: 0, bestSurvivalStreak: 0, bossVictories: 0,
      ...stats,
    },
    decorations: [],
  };
}

function roster() {
  return {
    pieces: {}, identities: {}, unitRecords: {}, memorial: [], unitServiceProcessedBattleIds: [], combatXp: 0,
  };
}

function addPiece(state, key, piece, stats = {}) {
  const identityId = `unit-${key}`;
  state.pieces[key] = { alive: true, strengthPoints: 0, speedPoints: 0, bankedXp: 0, ...piece };
  state.identities[key] = { alias: key, identityId };
  state.unitRecords[identityId] = service(identityId, stats);
  return state;
}

describe('compensación de amenaza de Combate', () => {
  it('no castiga un ejército fresco', () => {
    const threat = combatArmyThreat(roster());
    expect(threat.bonus).toBe(0);
    expect(balancedCombatDifficulty(40, roster())).toMatchObject({ base: 40, adjusted: 40, appliedBonus: 0 });
  });

  it('sube gradualmente por mejoras permanentes', () => {
    const state = roster();
    addPiece(state, 'n-b', { strengthPoints: 6, speedPoints: 6 });
    addPiece(state, 'b-c', { strengthPoints: 6, speedPoints: 6 });
    const threat = combatArmyThreat(state);
    expect(threat.totalStatPoints).toBe(24);
    expect(threat.statBonus).toBe(2);
    expect(threat.bonus).toBe(2);
  });

  it('cobra más por metamorfosis que por stats ordinarios', () => {
    const state = roster();
    addPiece(
      state,
      'p-a',
      { strengthPoints: 6, speedPoints: 5, deploymentType: 'r' },
      { battles: 12, survivals: 8, kills: 10, bestSurvivalStreak: 6, bossVictories: 1 },
    );
    const threat = combatArmyThreat(state);
    expect(threat.activeMetamorphoses).toBe(1);
    expect(threat.metamorphosisThreat).toBe(5);
    expect(threat.bonus).toBeGreaterThanOrEqual(5);
  });

  it('no cobra por una metamorfosis guardada que el expediente ya no valida', () => {
    const state = roster();
    addPiece(state, 'p-a', { strengthPoints: 6, speedPoints: 5, deploymentType: 'r' }, { battles: 20, survivals: 10, bossVictories: 0 });
    const threat = combatArmyThreat(state);
    expect(threat.activeMetamorphoses).toBe(0);
    expect(threat.metamorphosisThreat).toBe(0);
  });

  it('cuenta técnicas equipadas con tope y nunca lleva la CPU por encima de 100', () => {
    const state = roster();
    for (const file of 'abcdefgh') {
      addPiece(
        state,
        `p-${file}`,
        { strengthPoints: 8, speedPoints: 8, deploymentType: 'r', equippedTechnique: 'line_fire' },
        { battles: 20, survivals: 16, kills: 20, bestSurvivalStreak: 10, bossVictories: 2 },
      );
    }
    const threat = combatArmyThreat(state);
    expect(threat.techniqueBonus).toBe(4);
    expect(threat.bonus).toBe(20);
    expect(balancedCombatDifficulty(95, state)).toMatchObject({ base: 95, adjusted: 100, appliedBonus: 5 });
  });
});
