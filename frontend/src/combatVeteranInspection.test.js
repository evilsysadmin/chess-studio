import { describe, expect, it } from 'vitest';
import { combatVeteranAtSquare, combatVeteranInspectionOptions } from './combatVeteranInspection.js';

const veteran = (identityId = 'unit-varela') => ({
  deployment: { 'r-a': 'r-a', 'p-a': 'p-a', 'k-e': 'k-e' },
  identities: {
    'r-a': { identityId, alias: 'Varela' },
    'p-a': { identityId: 'unit-barea', alias: 'Barea' },
    'k-e': { identityId: 'unit-king', alias: 'Mando' },
  },
  pieces: {
    'r-a': { alive: true, strengthPoints: 3, speedPoints: 1 },
    'p-a': { alive: true, strengthPoints: 0, speedPoints: 0 },
    'k-e': { alive: true },
  },
  unitRecords: {
    [identityId]: {
      identityId, alias: 'Varela',
      stats: { battles: 5, survivals: 4, kills: 5, revives: 1 },
      decorations: [{ id: 'baptism', earnedAt: '2026-10-20T00:00:00Z' }, { id: 'five_kills', earnedAt: null }],
    },
    'unit-barea': { identityId: 'unit-barea', decorations: [], stats: {} },
  },
});

describe('Operations Room · authentic veteran inspection', () => {
  it('resolves the deployed identity and actual medals, not a fixed square or rank', () => {
    const roster = veteran();
    const dossier = combatVeteranAtSquare(roster, 'a1');
    expect(dossier).toMatchObject({
      square: 'a1', unitKey: 'r-a', identityId: 'unit-varela',
      alias: 'Varela', rank: 'Teniente', level: 5, battles: 5, kills: 5,
    });
    expect(dossier.decorations.map((m) => m.id)).toEqual(['baptism', 'five_kills']);
    expect(dossier.serviceMarks.map((m) => m.id)).toEqual(['revival-scar']);
    expect(combatVeteranInspectionOptions(roster).map((r) => r.square)).toEqual(['a1', 'a2']);
  });

  it('never assigns a dead or replaced identity its predecessor\'s medals', () => {
    const roster = veteran();
    roster.identities['r-a'] = { identityId: 'unit-new', alias: 'Recluta nuevo' };
    roster.unitRecords['unit-new'] = { identityId: 'unit-new', stats: {}, decorations: [] };
    expect(combatVeteranAtSquare(roster, 'a1').decorations).toEqual([]);
    delete roster.unitRecords['unit-new'];
    expect(combatVeteranAtSquare(roster, 'a1').decorations).toEqual([]);
    roster.pieces['r-a'].alive = false;
    expect(combatVeteranAtSquare(roster, 'a1')).toBeNull();
  });

  it('excludes the king, unused squares and records with contradictory identity', () => {
    const roster = veteran();
    expect(combatVeteranAtSquare(roster, 'e1')).toBeNull();
    expect(combatVeteranAtSquare(roster, 'c4')).toBeNull();
    roster.unitRecords['unit-varela'] = { identityId: 'someone-else', decorations: [{ id: 'ace' }] };
    expect(combatVeteranAtSquare(roster, 'a1')).toBeNull();
  });

  it('honours deployment moves and keeps empty new recruits honest', () => {
    const roster = veteran();
    roster.deployment = { 'r-h': 'r-a', 'p-a': 'p-a' };
    expect(combatVeteranAtSquare(roster, 'a1')).toBeNull();
    expect(combatVeteranAtSquare(roster, 'h1')?.alias).toBe('Varela');
    expect(combatVeteranAtSquare(roster, 'a2')).toMatchObject({ rank: 'Recluta', battles: 0, kills: 0, decorations: [] });
  });
});
