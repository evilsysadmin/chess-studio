import { describe, expect, it } from 'vitest';
import { buildCombatDebrief } from './combatDebrief.js';

function roster({ alive = true, level = 1, kills = 0 } = {}) {
  const identityId = 'id-p-a';
  return {
    pieces: { 'p-a': { alive, strengthPoints: Math.max(0, level - 1), speedPoints: 0 } },
    identities: { 'p-a': { identityId, alias: 'Morcilla' } },
    unitRecords: {
      [identityId]: {
        identityId,
        alias: 'Morcilla',
        stats: { battles: 2, survivals: alive ? 2 : 1, kills, bestSurvivalStreak: 2, bossVictories: 0, revives: 0 },
      },
    },
  };
}

describe('Combat Chess debriefing', () => {
  it('resume sólo hechos registrados de participantes reales', () => {
    const before = roster({ alive: true, level: 1, kills: 0 });
    const after = roster({ alive: true, level: 2, kills: 2 });
    const identityId = after.identities['p-a'].identityId;
    const debrief = buildCombatDebrief({
      outcome: 'win',
      beforeRoster: before,
      afterRoster: after,
      participants: [{ slotKey: 'p-a', identityId, alias: 'Morcilla' }],
      survivorIdentityIds: [identityId],
      killsByIdentity: { [identityId]: 2 },
      bossDamageByIdentity: { [identityId]: 1 },
      combatXpGained: 12,
      serviceResult: { meritGained: 4, promoted: false, newDecorations: [] },
    });
    expect(debrief).toMatchObject({ survivorCount: 1, deployedCount: 1, fallenCount: 0, totalKills: 2, totalBossDamage: 1, combatXpGained: 12, meritGained: 4 });
    expect(debrief.units[0]).toMatchObject({ alias: 'Morcilla', survived: true, kills: 2, levelGain: 1 });
  });

  it('marca una baja desplegada sin inventar bajas de reservas ausentes', () => {
    const before = roster({ alive: true });
    const after = roster({ alive: false });
    const identityId = after.identities['p-a'].identityId;
    const debrief = buildCombatDebrief({
      outcome: 'loss',
      beforeRoster: before,
      afterRoster: after,
      participants: [{ slotKey: 'p-a', identityId, alias: 'Morcilla' }],
      survivorIdentityIds: [],
    });
    expect(debrief.fallenCount).toBe(1);
    expect(debrief.units).toHaveLength(1);
    expect(debrief.units[0].fallen).toBe(true);
  });
});
