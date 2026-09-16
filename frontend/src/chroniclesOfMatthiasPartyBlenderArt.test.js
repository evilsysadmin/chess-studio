import { describe, expect, it } from 'vitest';
import {
  CHRONICLES_TACTICS_PARTY_ASSET_VERSION,
  CHRONICLES_TACTICS_PARTY_LEGACY_MODEL_PATH,
  CHRONICLES_TACTICS_PARTY_MEMBERS,
  CHRONICLES_TACTICS_PARTY_MODEL_URL,
  CHRONICLES_TACTICS_PARTY_R2_ASSET_ID,
  chroniclesTacticsPartyIdleName,
  chroniclesTacticsPartyRootName,
} from './chroniclesOfMatthiasPartyBlenderArt.js';

describe('Chronicles Tactics real Blender party runtime contract', () => {
  it('uses the canonical v8 runtime GLB through the reviewed R2 logical id', () => {
    expect(CHRONICLES_TACTICS_PARTY_R2_ASSET_ID).toBe('chronicles.tactics.party.runtime');
    expect(CHRONICLES_TACTICS_PARTY_LEGACY_MODEL_PATH).toBe('models/chronicles-tactics-party.glb');
    expect(CHRONICLES_TACTICS_PARTY_MODEL_URL).toMatch(/chronicles-tactics-party.*\.glb$/);
    expect(CHRONICLES_TACTICS_PARTY_MEMBERS).toEqual(['rook', 'bishop', 'knight']);
    expect(CHRONICLES_TACTICS_PARTY_ASSET_VERSION).toBe('chronicles-humanoid-party-v8');
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
