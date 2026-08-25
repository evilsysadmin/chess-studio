import { describe, expect, it } from 'vitest';
import { combatArmyGlance } from './combatArmyGlance.js';

function rosterFixture() {
  return {
    pieces: { 'p-a': { alive: true }, 'n-b': { alive: true }, 'b-c': { alive: false } },
    identities: {
      'p-a': { identityId: 'id-a', alias: 'Rivas' },
      'n-b': { identityId: 'id-b', alias: 'Mora' },
      'b-c': { identityId: 'id-c', alias: 'Vega' },
    },
    unitRecords: {
      'id-a': { alias: 'Rivas', stats: { battles: 8, survivals: 7, kills: 4, bossVictories: 1 }, decorations: [{ id: 'baptism' }, { id: 'five_kills' }] },
      'id-b': { alias: 'Mora', stats: { battles: 2, survivals: 1, kills: 0, bossVictories: 0 }, decorations: [] },
      'id-c': { alias: 'Vega', stats: { battles: 12, survivals: 9, kills: 7 }, decorations: [{ id: 'baptism' }] },
    },
    memorial: [{ identityId: 'old-1' }, { identityId: 'old-2' }],
  };
}

describe('combatArmyGlance', () => {
  it('resume sólo identidades activas y elige un veterano destacado con hechos reales', () => {
    const glance = combatArmyGlance(rosterFixture());
    expect(glance).toMatchObject({ active: 2, experienced: 2, decorated: 1, memorial: 2 });
    expect(glance.standout).toMatchObject({ alias: 'Rivas', battles: 8, kills: 4, bossVictories: 1 });
  });

  it('no inventa un veterano cuando nadie ha combatido', () => {
    const roster = rosterFixture();
    roster.unitRecords['id-a'].stats = { battles: 0 };
    roster.unitRecords['id-b'].stats = { battles: 0 };
    expect(combatArmyGlance(roster).standout).toBeNull();
  });
});
