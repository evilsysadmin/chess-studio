import { describe, expect, it } from 'vitest';
import { combatVeteranAtSquare, combatVeteranInspectionOptions } from './combatVeteranInspection.js';
import { deploymentFen } from './combatDeployment.js';

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
  it('follows canonical migration for legacy rosters missing Deployment v1', () => {
    const roster = veteran();
    delete roster.deployment;
    const original = JSON.stringify(roster);
    // The board backfills old canonical slots. The dossier must find exactly
    // the same units, rather than showing an empty selector next to the pieces.
    expect(deploymentFen(roster).split(' ')[0]).toContain('/P7/R3K3');
    expect(combatVeteranAtSquare(roster, 'a1')).toMatchObject({
      identityId: 'unit-varela', alias: 'Varela',
    });
    expect(combatVeteranInspectionOptions(roster).map((unit) => unit.square))
      .toEqual(['a1', 'a2']);
    expect(JSON.stringify(roster)).toBe(original); // read-only projection
  });

  it('respects intentional reserves and rejects incompatible/duplicate saved slots', () => {
    const reserved = veteran();
    reserved.deploymentVersion = 1;
    reserved.deployment = { 'p-a': 'p-a', 'k-e': 'k-e' };
    expect(combatVeteranAtSquare(reserved, 'a1')).toBeNull();
    expect(combatVeteranInspectionOptions(reserved).map((unit) => unit.square))
      .toEqual(['a2']); // no migration backfill of a deliberate vacancy

    const corrupt = veteran();
    corrupt.deploymentVersion = 1;
    corrupt.deployment = {
      'r-a': 'r-a', 'r-h': 'r-a', // one veteran assigned twice
      'p-a': 'p-a', 'n-b': 'p-a', // pawn assigned to a knight slot
      'k-e': 'k-e',
    };
    expect(combatVeteranAtSquare(corrupt, 'h1')).toBeNull();
    expect(combatVeteranAtSquare(corrupt, 'b1')).toBeNull();
    expect(combatVeteranInspectionOptions(corrupt).map((unit) => unit.square))
      .toEqual(['a1', 'a2']);
  });

  it('reports the same conservative rank as the physical board for damaged purchased stats', () => {
    const roster = veteran();
    roster.pieces['r-a'].strengthPoints = Infinity;
    roster.pieces['r-a'].speedPoints = '3';
    const before = JSON.stringify(roster);
    expect(combatVeteranAtSquare(roster, 'a1')).toMatchObject({
      level: 4, rank: 'Sargento', identityId: 'unit-varela',
    });
    roster.pieces['r-a'].speedPoints = 1.9;
    expect(combatVeteranAtSquare(roster, 'a1')).toMatchObject({
      level: 1, rank: 'Recluta',
    });
    roster.pieces['r-a'].strengthPoints = 3;
    roster.pieces['r-a'].speedPoints = 1;
    expect(combatVeteranAtSquare(roster, 'a1')).toMatchObject({
      level: 5, rank: 'Teniente',
    });
    expect(before).toContain('"speedPoints":"3"');
  });

  it('reads legacy service history without an embedded ID, but still rejects explicit contradictions', () => {
    const roster = veteran();
    const record = roster.unitRecords['unit-varela'];
    delete record.identityId; // pre-identityId schema; key still names the active identity
    const before = JSON.stringify(roster);
    expect(combatVeteranAtSquare(roster, 'a1')).toMatchObject({
      alias: 'Varela', identityId: 'unit-varela',
      battles: 5, survivals: 4, kills: 5,
      decorations: [{ id: 'baptism' }, { id: 'five_kills' }],
    });
    expect(combatVeteranInspectionOptions(roster).find((unit) => unit.square === 'a1')
      ?.serviceMarks.map((mark) => mark.id)).toEqual(['revival-scar']);
    expect(JSON.stringify(roster)).toBe(before); // never migrate during inspection

    record.identityId = 'fallen-other-veteran';
    expect(combatVeteranAtSquare(roster, 'a1')).toBeNull();
  });

});
