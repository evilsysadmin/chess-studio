import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CHRONICLES_TACTICS_PARTY_ASSET_VERSION,
  CHRONICLES_TACTICS_PARTY_MEMBERS,
  CHRONICLES_TACTICS_PARTY_MODEL_PATH,
  chroniclesTacticsPartyIdleName,
  chroniclesTacticsPartyRootName,
} from './chroniclesOfMatthiasPartyBlenderArt.js';

function readGlbJson() {
  const url = new URL(`../public/${CHRONICLES_TACTICS_PARTY_MODEL_PATH}`, import.meta.url);
  const bytes = readFileSync(url);
  expect(bytes.subarray(0, 4).toString('ascii')).toBe('glTF');
  expect(bytes.readUInt32LE(4)).toBe(2);
  expect(bytes.readUInt32LE(8)).toBe(bytes.length);
  const jsonLength = bytes.readUInt32LE(12);
  const jsonType = bytes.readUInt32LE(16);
  expect(jsonType).toBe(0x4e4f534a);
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').trimEnd());
}

describe('Chronicles Tactics real Blender party asset', () => {
  it('uses one stable runtime GLB for the three non-Matthias companions', () => {
    expect(CHRONICLES_TACTICS_PARTY_MODEL_PATH).toBe('models/chronicles-tactics-party.glb');
    expect(CHRONICLES_TACTICS_PARTY_MEMBERS).toEqual(['rook', 'bishop', 'knight']);
    expect(CHRONICLES_TACTICS_PARTY_ASSET_VERSION).toBe('chronicles-tactics-party-v1');
  });

  it('ships the expected Blender roots, idle clips and version extras', () => {
    const glb = readGlbJson();
    const nodes = new Map((glb.nodes || []).map((node) => [node.name, node]));
    const animations = new Set((glb.animations || []).map((clip) => clip.name));

    CHRONICLES_TACTICS_PARTY_MEMBERS.forEach((memberId) => {
      const rootName = chroniclesTacticsPartyRootName(memberId);
      expect(nodes.has(rootName)).toBe(true);
      expect(nodes.get(rootName)?.extras?.chronicles_member_id).toBe(memberId);
      expect(nodes.get(rootName)?.extras?.chronicles_asset_version).toBe(CHRONICLES_TACTICS_PARTY_ASSET_VERSION);
      expect(animations.has(chroniclesTacticsPartyIdleName(memberId))).toBe(true);
    });
  });
});
