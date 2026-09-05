import { beforeEach, describe, expect, it } from 'vitest';
import { loadRoster } from './combatRoster.js';
import { grantReserveRecruit, setDeploymentUnit } from './combatDeployment.js';
import { setRosterDeploymentType } from './combatMetamorphosis.js';
import { buildTacticalDeploymentBrief, deploymentSelectionFingerprint } from './combatTacticalDeployment.js';

beforeEach(() => localStorage.clear());

describe('Combat tactical deployment fingerprint', () => {
  it('es estable para la misma formación aunque cambie la identidad del objeto contenedor', () => {
    const roster = loadRoster();
    const clone = { ...roster, deployment: { ...roster.deployment } };
    expect(deploymentSelectionFingerprint(clone)).toBe(deploymentSelectionFingerprint(roster));
  });

  it('cambia al sustituir una unidad desplegada por una reserva compatible', () => {
    let roster = loadRoster();
    roster = grantReserveRecruit(roster, { grantId: 'fingerprint:reserve', originType: 'p', rng: () => 0.4, now: 4000 });
    const reserveKey = Object.keys(roster.identities).find((key) => key.startsWith('p-reserve-'));
    const before = deploymentSelectionFingerprint(roster);
    roster = setDeploymentUnit(roster, 'p-a', reserveKey);
    expect(deploymentSelectionFingerprint(roster)).not.toBe(before);
  });

  it('cambia si una identidad conserva su slot pero cambia su forma de batalla', () => {
    let roster = loadRoster();
    const identityId = roster.identities['p-a'].identityId;
    roster = {
      ...roster,
      pieces: {
        ...roster.pieces,
        'p-a': { ...roster.pieces['p-a'], strengthPoints: 7 },
      },
      unitRecords: {
        ...roster.unitRecords,
        [identityId]: {
          ...roster.unitRecords[identityId],
          stats: { ...roster.unitRecords[identityId].stats, battles: 3, survivals: 3 },
        },
      },
    };
    const before = deploymentSelectionFingerprint(roster);
    roster = setRosterDeploymentType(roster, 'p-a', 'n');
    expect(deploymentSelectionFingerprint(roster)).not.toBe(before);
  });
});

describe('Combat tactical deployment brief', () => {
  it('separa barracón, fuerza desplegada y veteranos protegidos en reserva', () => {
    let roster = loadRoster();
    roster = grantReserveRecruit(roster, { grantId: 'brief:reserve', originType: 'p', rng: () => 0.6, now: 6000 });
    const reserveKey = Object.keys(roster.identities).find((key) => key.startsWith('p-reserve-'));
    roster = {
      ...roster,
      pieces: {
        ...roster.pieces,
        [reserveKey]: { ...roster.pieces[reserveKey], strengthPoints: 4 },
        'p-a': { ...roster.pieces['p-a'], strengthPoints: 2 },
      },
    };
    const brief = buildTacticalDeploymentBrief(roster, {
      difficultyBalance: { appliedBonus: 3, threat: { tier: 'Ligera' } },
    });
    expect(brief).toMatchObject({
      barracksCount: 17,
      deployedCount: 16,
      reserveCount: 1,
      deployedVeteranCount: 1,
      protectedVeteranCount: 1,
      threatBonus: 3,
      threatTier: 'Ligera',
    });
    expect(brief.protectedVeteranKeys).toContain(reserveKey);
  });
});
