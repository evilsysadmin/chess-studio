import { describe, expect, it } from 'vitest';
import {
  CHRONICLES_TACTICS_PARTY_ASSET_VERSION,
  CHRONICLES_TACTICS_PARTY_MEMBERS,
  CHRONICLES_TACTICS_PARTY_MODEL_PATH,
  chroniclesTacticsPartyIdleName,
  chroniclesTacticsPartyRootName,
} from './chroniclesOfMatthiasPartyBlenderArt.js';

describe('Chronicles Tactics real Blender party runtime contract', () => {
  it('uses one stable versioned runtime GLB for the three non-Matthias companions', () => {
    expect(CHRONICLES_TACTICS_PARTY_MODEL_PATH).toBe('models/chronicles-tactics-party.glb');
    expect(CHRONICLES_TACTICS_PARTY_MEMBERS).toEqual(['rook', 'bishop', 'knight']);
    expect(CHRONICLES_TACTICS_PARTY_ASSET_VERSION).toBe('chronicles-tactics-party-v3');
  });

  it('maps every persistent member id to its Blender root and idle action contract', () => {
    expect(CHRONICLES_TACTICS_PARTY_MEMBERS.map(chroniclesTacticsPartyRootName)).toEqual([
      'ChroniclesParty__rook',
      'ChroniclesParty__bishop',
      'ChroniclesParty__knight',
    ]);
    expect(CHRONICLES_TACTICS_PARTY_MEMBERS.map(chroniclesTacticsPartyIdleName)).toEqual([
      'Idle.rook',
      'Idle.bishop',
      'Idle.knight',
    ]);
  });
});
