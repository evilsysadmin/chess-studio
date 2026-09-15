import { describe, expect, it } from 'vitest';
import { createChroniclesState } from './chroniclesOfMatthias.js';
import {
  chroniclesTacticsAttack,
  chroniclesTacticsFinishTurn,
  chroniclesTacticsInteractions,
  chroniclesTacticsLegalMoves,
  chroniclesTacticsMove,
  chroniclesTacticsProfile,
  chroniclesTacticsTargets,
  chroniclesTacticsUse,
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

  it('gives every party member a distinct tactical class and weapon identity', () => {
    expect(chroniclesTacticsProfile('matthias')).toMatchObject({ className: 'Espadachín', attackPattern: 'adjacent', reach: 1 });
    expect(chroniclesTacticsProfile('rook')).toMatchObject({ className: 'Guardiana', attackPattern: 'orthogonal', reach: 2 });
    expect(chroniclesTacticsProfile('bishop')).toMatchObject({ className: 'Taumaturgo', attackKind: 'spell', attackPattern: 'diagonal', reach: 4 });
    expect(chroniclesTacticsProfile('knight')).toMatchObject({ className: 'Hostigador', attackKind: 'ranged', attackPattern: 'line', reach: 3 });
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
