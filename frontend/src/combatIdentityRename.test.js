import { describe, expect, it } from 'vitest';
import { renameCombatIdentity } from './combatIdentity.js';

describe('rename de unidades', () => {
  const roster = { identities: { 'p-a': { alias: 'Biscuit', identityId: 'u1' }, 'p-b': { alias: 'Patch', identityId: 'u2' } } };
  it('cambia solo el alias y conserva identidad', () => {
    const next = renameCombatIdentity(roster, 'p-a', 'Rivas');
    expect(next.identities['p-a']).toEqual({ alias: 'Rivas', identityId: 'u1' });
  });
  it('rechaza duplicados', () => {
    expect(renameCombatIdentity(roster, 'p-a', ' patch ')).toBe(roster);
  });
});
