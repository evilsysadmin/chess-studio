import { describe, expect, it } from 'vitest';
import { createChroniclesState } from './chroniclesOfMatthias.js';
import {
  chroniclesTacticsAbilityStatus,
  chroniclesTacticsAbilityTargets,
  chroniclesTacticsAttack,
  chroniclesTacticsFinishTurn,
  chroniclesTacticsInteractions,
  chroniclesTacticsLegalMoves,
  chroniclesTacticsMove,
  chroniclesTacticsProfile,
  chroniclesTacticsTargets,
  chroniclesTacticsUse,
  chroniclesTacticsUseAbility,
} from './chroniclesOfMatthiasTactics.js';

function tacticsState(overrides = {}) {
  return {
    ...createChroniclesState(),
    round: 1,
    turnPhase: 'party',
    enemyPositions: {},
    enemyTurnEvents: [],
    ...overrides,
  };
}

describe('Chronicles of Matthias Tactics · player turns', () => {
  it('offers only legal adjacent cells and never walks through the opening pawn', () => {
    const moves = chroniclesTacticsLegalMoves(tacticsState());
    expect(moves.map(({ key, x, y }) => [key, x, y])).toEqual([
      ['north', 1, 4],
      ['east', 2, 5],
    ]);
  });

  it('makes the ancient sigil a contextual use action instead of a walk-on trigger', () => {
    const before = tacticsState({ x: 3, y: 3 });
    const sigilMove = chroniclesTacticsLegalMoves(before).find((move) => move.x === 3 && move.y === 4);
    const standingOnSigil = chroniclesTacticsMove(before, sigilMove);

    expect(standingOnSigil.sigilAwake).toBe(false);
    expect(chroniclesTacticsInteractions(standingOnSigil)).toEqual([
      expect.objectContaining({ id: 'ancient-sigil', label: 'Activar sello' }),
    ]);

    const activated = chroniclesTacticsUse(standingOnSigil);
    expect(activated.sigilAwake).toBe(true);
    expect(activated.message).toMatch(/activa el sello/i);
    expect(activated.journal.some((entry) => entry.id === 'tactics-sigil-awake')).toBe(true);
  });

  it('keeps the black exit as an explicit use action and explains why it is locked', () => {
    const locked = tacticsState({ x: 2, y: 1 });
    expect(chroniclesTacticsLegalMoves(locked).some((move) => move.x === 3 && move.y === 1)).toBe(false);
    expect(chroniclesTacticsInteractions(locked)).toEqual([
      expect.objectContaining({ id: 'black-gate', label: 'Examinar Puerta Negra' }),
    ]);

    const examined = chroniclesTacticsUse(locked);
    expect(examined.phase).toBe('explore');
    expect(examined.message).toMatch(/no responde/i);

    const unlocked = tacticsState({
      x: 2,
      y: 1,
      sigilAwake: true,
      jailerHp: 0,
      scavengerHp: 0,
      blackGateKey: true,
    });
    expect(chroniclesTacticsInteractions(unlocked)).toEqual([
      expect.objectContaining({ id: 'black-gate', label: 'Abrir Puerta Negra' }),
    ]);
    expect(chroniclesTacticsUse(unlocked).phase).toBe('escaped');
  });

  it('gives every party member a distinct tactical class, weapon and active ability', () => {
    expect(chroniclesTacticsProfile('matthias')).toMatchObject({ className: 'Espadachín', attackPattern: 'adjacent', reach: 1, abilityName: 'Zornhau' });
    expect(chroniclesTacticsProfile('rook')).toMatchObject({ className: 'Guardiana', attackPattern: 'orthogonal', reach: 2, abilityName: 'Bastión' });
    expect(chroniclesTacticsProfile('bishop')).toMatchObject({ className: 'Taumaturgo', attackKind: 'spell', attackPattern: 'diagonal', reach: 4, abilityName: 'Lux in Tenebris' });
    expect(chroniclesTacticsProfile('knight')).toMatchObject({ className: 'Hostigador', attackKind: 'ranged', attackPattern: 'line', reach: 3, abilityName: 'Virote perforante' });
  });

  it('uses class-specific attack geometry instead of one generic range rule', () => {
    const opening = tacticsState();
    expect(chroniclesTacticsTargets(opening, 'matthias')).toEqual([]);
    expect(chroniclesTacticsTargets(opening, 'rook')).toEqual([
      expect.objectContaining({ enemyId: 'corrupted-pawn', distance: 2 }),
    ]);
    expect(chroniclesTacticsTargets(opening, 'bishop')).toEqual([]);
    expect(chroniclesTacticsTargets(opening, 'knight')).toEqual([
      expect.objectContaining({ enemyId: 'corrupted-pawn', distance: 2, attackKind: 'ranged' }),
    ]);

    const diagonal = tacticsState({ enemyPositions: { 'corrupted-pawn': { x: 2, y: 4 } } });
    expect(chroniclesTacticsTargets(diagonal, 'bishop')).toEqual([
      expect.objectContaining({ enemyId: 'corrupted-pawn', distance: 1, attackKind: 'spell' }),
    ]);
    expect(chroniclesTacticsTargets(diagonal, 'matthias')).toEqual([]);
  });

  it('gives Matthias a one-use Zornhau instead of a second generic attack button', () => {
    const state = tacticsState({ x: 2, y: 5 });
    expect(chroniclesTacticsAbilityStatus(state, 'matthias').ready).toBe(true);

    const after = chroniclesTacticsUseAbility(state, 'matthias');
    expect(after.enemyHp).toBe(3);
    expect(after.tacticsAbilityUses.matthias).toBe(1);
    expect(after.message).toMatch(/Zornhau/i);

    expect(chroniclesTacticsAbilityStatus(after, 'matthias')).toMatchObject({ ready: false, spent: true });
    expect(chroniclesTacticsUseAbility(after, 'matthias')).toBe(after);
  });

  it('lets Hildegard spend Bastión on the genuinely most wounded living ally', () => {
    const baseParty = createChroniclesState().party;
    const state = tacticsState({
      party: baseParty.map((member) => {
        if (member.id === 'bishop') return { ...member, hp: 1 };
        if (member.id === 'matthias') return { ...member, hp: member.maxHp - 1 };
        return member;
      }),
    });

    const next = chroniclesTacticsUseAbility(state, 'rook');
    expect(next.party.find((member) => member.id === 'bishop').hp).toBe(3);
    expect(next.party.find((member) => member.id === 'matthias').hp).toBe(baseParty.find((member) => member.id === 'matthias').maxHp - 1);
    expect(next.tacticsAbilityUses.rook).toBe(1);
    expect(next.message).toMatch(/Bastión/i);
  });

  it('makes Lux in Tenebris a real diagonal multi-target spell', () => {
    const state = tacticsState({
      x: 3,
      y: 4,
      enemyHp: 0,
      sigilAwake: true,
      enemyPositions: {
        'gate-jailer': { x: 2, y: 3 },
        'spectral-bishop': { x: 2, y: 5 },
      },
    });

    expect(chroniclesTacticsAbilityTargets(state, 'bishop')).toEqual([
      expect.objectContaining({ enemyId: 'gate-jailer', distance: 1 }),
      expect.objectContaining({ enemyId: 'spectral-bishop', distance: 1 }),
    ]);
    const next = chroniclesTacticsUseAbility(state, 'bishop');
    expect(next.jailerHp).toBe(state.jailerHp - 2);
    expect(next.spectralBishopHp).toBe(state.spectralBishopHp - 2);
    expect(next.tacticsAbilityUses.bishop).toBe(1);
    expect(next.message).toMatch(/2 enemigos/i);
  });

  it('turns Morcilla into a limited long-range finisher with the perforating bolt', () => {
    const state = tacticsState();
    const targets = chroniclesTacticsAbilityTargets(state, 'knight');
    expect(targets).toEqual([expect.objectContaining({ enemyId: 'corrupted-pawn', distance: 2 })]);

    const next = chroniclesTacticsUseAbility(state, 'knight');
    expect(next.enemyHp).toBe(3);
    expect(next.tacticsAbilityUses.knight).toBe(1);
    expect(next.message).toMatch(/Virote perforante/i);
  });

  it('resolves class damage first and leaves retaliation to the creature phase', () => {
    const state = tacticsState();
    const afterAttack = chroniclesTacticsAttack(state, 'rook', 'corrupted-pawn');
    expect(afterAttack.enemyHp).toBe(4);
    expect(afterAttack.party.map((member) => member.hp)).toEqual(state.party.map((member) => member.hp));
    expect(afterAttack.turns).toBe(1);

    const afterEnemy = chroniclesTacticsFinishTurn(afterAttack);
    expect(afterEnemy.round).toBe(2);
    expect(afterEnemy.turnPhase).toBe('party');
    expect(afterEnemy.enemyPositions['corrupted-pawn']).toEqual({ x: 2, y: 5 });
    expect(afterEnemy.message).toMatch(/Hildegard usa embestida de torre/i);
  });

  it('keeps Chronicles rewards when a ranged tactical kill matters to progression', () => {
    const state = tacticsState({
      x: 5,
      y: 5,
      sigilAwake: true,
      spectralBishopHp: 1,
      party: createChroniclesState().party.map((member) => ({ ...member, hp: Math.max(1, member.hp - 1) })),
    });
    const previousAzizHp = state.party.find((member) => member.id === 'bishop').hp;
    const next = chroniclesTacticsAttack(state, 'knight', 'spectral-bishop');
    expect(next.spectralBishopHp).toBe(0);
    expect(next.spectralLantern).toBe(true);
    expect(next.party.find((member) => member.id === 'bishop').hp).toBe(previousAzizHp + 1);
  });
});
