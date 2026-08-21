import { describe, expect, it } from 'vitest';
import { createCombatIdentity, ensureCombatIdentities } from './combatIdentity.js';

describe('identidad de piezas de Combate', () => {
  it('cada slot recibe alias e identidad desde nivel 1, incluido el rey', () => {
    const roster = ensureCombatIdentities({ pieces: {}, identities: {}, combatXp: 0 }, () => 0.25, 1000);
    expect(Object.keys(roster.identities)).toHaveLength(16);
    expect(roster.identities['p-a'].alias).toBeTruthy();
    expect(roster.identities['k-e'].alias).toBeTruthy();
    expect(new Set(Object.values(roster.identities).map((x) => x.alias)).size).toBe(16);
  });

  it('evita repetir alias mientras queden nombres libres', () => {
    const a = createCombatIdentity([], () => 0, 1);
    const b = createCombatIdentity([a.alias], () => 0, 2);
    expect(b.alias).not.toBe(a.alias);
    expect(b.identityId).not.toBe(a.identityId);
  });
});
