import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  CHRONICLES_PREMIUM_BACK_DETAIL_NAMES,
  CHRONICLES_TACTICS_BLENDER_ART_META,
  installChroniclesPartyFallbackDetails,
} from './chroniclesOfMatthiasBlenderArt.js';

describe('Chronicles Tactics premium party art', () => {
  it('keeps rear-facing detail on every non-Matthias party silhouette', () => {
    expect(Object.keys(CHRONICLES_PREMIUM_BACK_DETAIL_NAMES)).toEqual(['rook', 'bishop', 'knight']);
    Object.values(CHRONICLES_PREMIUM_BACK_DETAIL_NAMES).forEach((names) => {
      expect(names.length).toBeGreaterThanOrEqual(3);
      expect(new Set(names).size).toBe(names.length);
    });
  });

  it('keeps the Blender producer as the editable source for the party', () => {
    expect(CHRONICLES_TACTICS_BLENDER_ART_META.partySourceOfTruth)
      .toBe('scripts/blender/build_chronicles_tactics_party.py');
    expect(CHRONICLES_TACTICS_BLENDER_ART_META.partyBackDetail)
      .toBe('premium-rear-silhouette-v1');
    expect(CHRONICLES_TACTICS_BLENDER_ART_META.runtimeUpgrade)
      .toBe('async-fallback-first-lazy-detail');
  });

  it('builds premium procedural rear detail only for requested fallback members', async () => {
    const partyRoot = new THREE.Group();
    const members = new Map();
    ['rook', 'bishop', 'knight'].forEach((memberId) => {
      const member = new THREE.Group();
      member.userData.chroniclesCharacterId = memberId;
      members.set(memberId, member);
      partyRoot.add(member);
    });

    const cancel = installChroniclesPartyFallbackDetails(partyRoot, {
      coarsePointer: true,
      memberIds: ['bishop'],
    });
    await Promise.resolve();

    expect(members.get('rook').userData.chroniclesBackDetail).toBeUndefined();
    expect(members.get('bishop').userData.chroniclesBackDetail).toBe('premium-rear-silhouette-v1');
    expect(members.get('bishop').getObjectByName('aziz-back-rune')).toBeTruthy();
    expect(members.get('knight').userData.chroniclesBackDetail).toBeUndefined();

    cancel();
    expect(members.get('bishop').getObjectByName('aziz-back-rune')).toBeUndefined();
    expect(members.get('bishop').userData.chroniclesBackDetail).toBeNull();
  });
});
