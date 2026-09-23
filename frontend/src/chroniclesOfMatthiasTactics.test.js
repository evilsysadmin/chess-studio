import { describe, expect, it } from 'vitest';
import { createChroniclesState } from './chroniclesOfMatthias.js';
import {
  chroniclesTacticsAbility,
  chroniclesTacticsAbilityStatus,
  chroniclesTacticsAttack,
  chroniclesTacticsFinishTurn,
  chroniclesTacticsInteractions,
  chroniclesTacticsLegalMoves,
  chroniclesTacticsMove,
  chroniclesTacticsProfile,
  chroniclesTacticsTargets,
  chroniclesTacticsUse,
  chroniclesTacticsWait,
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
      expect.objectContaining({ id: 'black-gate', label: 'Cruzar Puerta Negra' }),
    ]);
    const crossed = chroniclesTacticsUse(unlocked);
    expect(crossed.phase).toBe('explore');
    expect(crossed.mapId).toBe('gallery-of-forks');
  });

  it('opens a real rune cache with the contextual lever and reveals a pickup', () => {
    const atLever = tacticsState({ x: 5, y: 5 });
    expect(chroniclesTacticsInteractions(atLever)).toEqual([
      expect.objectContaining({ id: 'rune-cache-lever', kind: 'lever', label: 'Accionar palanca' }),
    ]);

    const opened = chroniclesTacticsUse(atLever);
    expect(opened.runeCacheOpened).toBe(true);
    expect(opened.turns).toBe(1);
    expect(opened.message).toMatch(/palanca baja/i);
    expect(opened.journal.some((entry) => entry.id === 'tactics-rune-cache-open')).toBe(true);
    expect(chroniclesTacticsInteractions(opened)).toEqual([]);

    const atPickup = { ...opened, x: 5, y: 4 };
    expect(chroniclesTacticsInteractions(atPickup)).toEqual([
      expect.objectContaining({ id: 'rune-core', kind: 'pickup', label: 'Recoger núcleo rúnico' }),
    ]);
  });

  it('refills spent class abilities once when the rune core is collected', () => {
    const state = tacticsState({
      x: 5,
      y: 4,
      runeCacheOpened: true,
      classAbilityCharges: {
        matthias: 0,
        rook: 0,
        bishop: 1,
        knight: 0,
      },
    });

    const collected = chroniclesTacticsUse(state);
    expect(collected.runeCoreCollected).toBe(true);
    expect(collected.classAbilityCharges).toEqual({
      matthias: 1,
      rook: 1,
      bishop: 1,
      knight: 1,
    });
    expect(collected.message).toMatch(/habilidades de clase vuelven a estar cargadas/i);
    expect(collected.journal.some((entry) => entry.id === 'tactics-rune-core-collected')).toBe(true);
    expect(chroniclesTacticsInteractions(collected)).toEqual([]);
  });

  it('gives every party member a distinct tactical class, weapon and active ability', () => {
    expect(chroniclesTacticsProfile('matthias')).toMatchObject({ className: 'Espadachín', attackPattern: 'adjacent', reach: 1, abilityName: 'Ruptura teutona' });
    expect(chroniclesTacticsProfile('rook')).toMatchObject({ className: 'Guardiana', attackPattern: 'orthogonal', reach: 2, abilityName: 'Martillo de asedio' });
    expect(chroniclesTacticsProfile('bishop')).toMatchObject({ className: 'Taumaturgo', attackKind: 'spell', attackPattern: 'diagonal', reach: 4, abilityName: 'Luz del farol' });
    expect(chroniclesTacticsProfile('knight')).toMatchObject({ className: 'Hostigador', attackKind: 'ranged', attackPattern: 'line', reach: 3, abilityName: 'Salva de virotes' });
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

  it('spends Hildegard class ability once per encounter and refuses a second cast', () => {
    const state = tacticsState();
    expect(chroniclesTacticsAbilityStatus(state, 'rook')).toMatchObject({ ready: true, charges: 1, abilityName: 'Martillo de asedio' });

    const afterAbility = chroniclesTacticsAbility(state, 'rook');
    expect(afterAbility.enemyHp).toBe(2);
    expect(afterAbility.classAbilityCharges.rook).toBe(0);
    expect(afterAbility.turns).toBe(1);
    expect(afterAbility.message).toMatch(/Hildegard desata martillo de asedio/i);
    expect(chroniclesTacticsAbilityStatus(afterAbility, 'rook')).toMatchObject({ ready: false, charges: 0, reason: 'Agotada' });
    expect(chroniclesTacticsAbility(afterAbility, 'rook')).toBe(afterAbility);
  });

  it('lets Aziz spend his spell charge healing the wounded party', () => {
    const party = createChroniclesState().party.map((member) => ({ ...member, hp: Math.max(1, member.hp - 2) }));
    const state = tacticsState({ party });
    expect(chroniclesTacticsAbilityStatus(state, 'bishop')).toMatchObject({ ready: true, charges: 1 });

    const healed = chroniclesTacticsAbility(state, 'bishop');
    healed.party.forEach((member, index) => {
      expect(member.hp).toBe(Math.min(member.maxHp, party[index].hp + 2));
    });
    expect(healed.classAbilityCharges.bishop).toBe(0);
    expect(healed.message).toMatch(/Aziz invoca Luz del farol/i);
  });

  it('does not waste Aziz spell charge when nobody needs healing', () => {
    const state = tacticsState();
    expect(chroniclesTacticsAbilityStatus(state, 'bishop')).toMatchObject({ ready: false, charges: 1, reason: 'Nadie necesita curación' });
    expect(chroniclesTacticsAbility(state, 'bishop')).toBe(state);
  });

  it('lets Faust fire a charged ranged volley', () => {
    const state = tacticsState();
    const afterVolley = chroniclesTacticsAbility(state, 'knight');
    expect(afterVolley.enemyHp).toBe(4);
    expect(afterVolley.classAbilityCharges.knight).toBe(0);
    expect(afterVolley.message).toMatch(/Faust desata salva de virotes/i);
  });

  it('resolves class damage first and leaves creature action to the enemy phase', () => {
    const state = tacticsState();
    const afterAttack = chroniclesTacticsAttack(state, 'rook', 'corrupted-pawn');
    expect(afterAttack.enemyHp).toBe(4);
    expect(afterAttack.party.map((member) => member.hp)).toEqual(state.party.map((member) => member.hp));
    expect(afterAttack.turns).toBe(1);

    const afterEnemy = chroniclesTacticsFinishTurn(afterAttack);
    expect(afterEnemy.round).toBe(2);
    expect(afterEnemy.turnPhase).toBe('party');
    expect(afterEnemy.party.map((member) => member.hp)).toEqual(state.party.map((member) => member.hp));
    expect(afterEnemy.enemyTurnEvents).toContainEqual(expect.objectContaining({
      type: 'move',
      enemyId: 'corrupted-pawn',
    }));
    expect(afterEnemy.message).toMatch(/Hildegard usa embestida de torre/i);
  });

  it('keeps generic tactical narration independent from the active map family', () => {
    const waiting = chroniclesTacticsWait(tacticsState(), 'matthias');
    expect(waiting.message).not.toMatch(/cripta/i);

    const killState = tacticsState({
      x: 5,
      y: 5,
      sigilAwake: true,
      spectralBishopHp: 1,
    });
    const killed = chroniclesTacticsAttack(killState, 'knight', 'spectral-bishop');
    const defeatEntry = killed.journal.find((entry) => entry.id === 'tactics-spectral-bishop-falls');

    expect(defeatEntry?.body).toBeTruthy();
    expect(defeatEntry.body).not.toMatch(/cripta/i);
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
