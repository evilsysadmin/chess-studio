import { describe, expect, it } from 'vitest';
import { createCombatIdentity, ensureCombatIdentities } from './combatIdentity.js';

describe('identidad de piezas de Combate', () => {
  it('cada slot recibe alias e identidad desde nivel 1, incluido el rey', () => {
    const roster = ensureCombatIdentities({ pieces: {}, identities: {}, combatXp: 0 }, () => 0.25, 1000);
    expect(Object.keys(roster.identities)).toHaveLength(16);
    expect(roster.identities['p-a'].alias).toBeTruthy();
    expect(roster.identities['k-e'].alias).toBeTruthy();
    expect(Object.values(roster.identities).every((identity) => identity.bioStatus === 'pending')).toBe(true);
    expect(new Set(Object.values(roster.identities).map((x) => x.alias)).size).toBe(16);
  });

  it('evita repetir alias mientras queden nombres libres', () => {
    const a = createCombatIdentity([], () => 0, 1);
    const b = createCombatIdentity([a.alias], () => 0, 2);
    expect(b.alias).not.toBe(a.alias);
    expect(b.identityId).not.toBe(a.identityId);
  });

  it('usa aliases de porte marcial y migra el catálogo antiguo sin perder la identidad', () => {
    const roster = ensureCombatIdentities({
      pieces: {},
      identities: { 'p-a': { alias: 'Skippy', identityId: 'unit-old', createdAt: '2026-08-01T00:00:00.000Z' } },
      unitRecords: { 'unit-old': { identityId: 'unit-old', alias: 'Skippy', stats: {} } },
      combatXp: 0,
    }, () => 0, 1000);
    expect(roster.identities['p-a'].alias).toBe('Varela');
    expect(roster.identities['p-a'].identityId).toBe('unit-old');
    expect(roster.identities['p-a'].bioStatus).toBe('pending');
    expect(roster.unitRecords['unit-old'].alias).toBe('Varela');
    expect(Object.values(roster.identities).some((entry) => ['Skippy', 'Biscuit', 'Noodles', 'Pogo'].includes(entry.alias))).toBe(false);
  });

  it('no reescribe aliases históricos del Memorial durante la migración marcial', () => {
    const roster = ensureCombatIdentities({
      pieces: {},
      identities: {},
      memorial: [{ identityId: 'fallen-old', alias: 'Starky', finalLevel: 6, finalRankLabel: 'Capitán' }],
      combatXp: 0,
    }, () => 0, 1000);
    expect(roster.memorial[0]).toMatchObject({ identityId: 'fallen-old', alias: 'Starky', finalLevel: 6, finalRankLabel: 'Capitán' });
  });


});
