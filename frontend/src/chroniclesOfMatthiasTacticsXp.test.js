import { describe, expect, it } from 'vitest';
import { createChroniclesState } from './chroniclesOfMatthias.js';
import {
  chroniclesTacticsAbility,
  chroniclesTacticsAttack,
  chroniclesTacticsUse,
} from './chroniclesOfMatthiasTactics.js';

function tacticsState(overrides = {}) {
  return {
    ...createChroniclesState(),
    round: 1,
    turnPhase: 'party',
    enemyPositions: {},
    enemyTurnEvents: [],
    classAbilityCharges: {
      matthias: 1,
      rook: 1,
      bishop: 1,
      knight: 1,
    },
    xpAwards: [],
    ...overrides,
  };
}

describe('Chronicles Tactics factual XP emission', () => {
  it('credits useful damage once per hero/enemy and the actual killer once', () => {
    const first = chroniclesTacticsAttack(tacticsState(), 'rook', 'corrupted-pawn');
    expect(first.xpAwards).toEqual([
      expect.objectContaining({
        id: 'crypt-01:damage:rook:corrupted-pawn',
        heroId: 'rook',
        amount: 2,
      }),
    ]);

    const second = chroniclesTacticsAttack(first, 'rook', 'corrupted-pawn');
    expect(second.xpAwards.filter((award) => award.id.includes(':damage:'))).toHaveLength(1);

    const killed = chroniclesTacticsAttack(second, 'rook', 'corrupted-pawn');
    expect(killed.enemyHp).toBe(0);
    expect(killed.xpAwards).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'crypt-01:kill:corrupted-pawn', heroId: 'rook', amount: 5 }),
    ]));
  });

  it('credits support only when Aziz actually restores HP', () => {
    const woundedParty = createChroniclesState().party.map((member) => ({
      ...member,
      hp: Math.max(1, member.hp - 2),
    }));
    const healed = chroniclesTacticsAbility(tacticsState({ party: woundedParty }), 'bishop');
    expect(healed.xpAwards).toEqual([
      expect.objectContaining({
        id: 'crypt-01:support:lantern-heal',
        heroId: 'bishop',
        amount: 4,
      }),
    ]);

    const healthy = tacticsState();
    expect(chroniclesTacticsAbility(healthy, 'bishop')).toBe(healthy);
  });

  it('credits one deterministic objective event to the hero who performs the interaction', () => {
    const atSigil = tacticsState({ x: 3, y: 4 });
    const first = chroniclesTacticsUse(atSigil, 'ancient-sigil', 'matthias');
    const retry = chroniclesTacticsUse(atSigil, 'ancient-sigil', 'rook');

    expect(first.xpAwards).toEqual([
      expect.objectContaining({
        id: 'crypt-01:objective:ancient-sigil',
        heroId: 'matthias',
        amount: 3,
      }),
    ]);
    expect(retry.xpAwards[0].id).toBe(first.xpAwards[0].id);
  });

  it('credits extraction plus survival only to living heroes', () => {
    const party = createChroniclesState().party.map((member) => (
      member.id === 'knight' ? { ...member, hp: 0 } : member
    ));
    const readyToLeave = tacticsState({
      x: 2,
      y: 1,
      sigilAwake: true,
      jailerHp: 0,
      scavengerHp: 0,
      blackGateKey: true,
      party,
    });
    const escaped = chroniclesTacticsUse(readyToLeave, 'black-gate', 'rook');

    expect(escaped.phase).toBe('escaped');
    expect(escaped.xpAwards).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'crypt-01:objective:escape', heroId: 'rook', amount: 3 }),
      expect.objectContaining({ id: 'crypt-01:survival:matthias', heroId: 'matthias', amount: 4 }),
      expect.objectContaining({ id: 'crypt-01:survival:rook', heroId: 'rook', amount: 4 }),
      expect.objectContaining({ id: 'crypt-01:survival:bishop', heroId: 'bishop', amount: 4 }),
    ]));
    expect(escaped.xpAwards.some((award) => award.id === 'crypt-01:survival:knight')).toBe(false);
  });
});
