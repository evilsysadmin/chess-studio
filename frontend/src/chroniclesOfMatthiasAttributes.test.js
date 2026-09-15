import { describe, expect, it } from 'vitest';
import { createChroniclesState } from './chroniclesOfMatthias.js';
import {
  CHRONICLES_ATTRIBUTE_CAP,
  applyChroniclesProgressionToTacticsState,
  chroniclesHeroProgress,
  chroniclesXpThresholdForLevel,
  createChroniclesProgression,
  grantChroniclesXp,
  normalizeChroniclesProgression,
  spendChroniclesAttributePoint,
} from './chroniclesOfMatthiasProgression.js';
import {
  chroniclesTacticsAbility,
  chroniclesTacticsAttack,
  chroniclesTacticsTargets,
  chroniclesTacticsUse,
} from './chroniclesOfMatthiasTactics.js';

function progressionWith(memberId, attributes) {
  const base = createChroniclesProgression();
  return normalizeChroniclesProgression({
    ...base,
    heroes: {
      ...base.heroes,
      [memberId]: {
        ...base.heroes[memberId],
        attributes: { ...base.heroes[memberId].attributes, ...attributes },
      },
    },
  });
}

function tacticsState(progression, overrides = {}) {
  return applyChroniclesProgressionToTacticsState({
    ...createChroniclesState(),
    round: 1,
    turnPhase: 'party',
    enemyPositions: {},
    enemyTurnEvents: [],
    ...overrides,
  }, progression);
}

describe('Chronicles Tactics · class attributes', () => {
  it('spends points only on attributes that matter to that class', () => {
    const leveled = grantChroniclesXp(
      createChroniclesProgression(),
      'matthias',
      chroniclesXpThresholdForLevel(2),
      'fixture:level-two',
    ).progression;

    const trap = spendChroniclesAttributePoint(leveled, 'matthias', 'precision');
    expect(trap.spent).toBe(false);
    expect(trap.reason).toMatch(/ajeno/i);

    const valid = spendChroniclesAttributePoint(leveled, 'matthias', 'power');
    expect(valid.spent).toBe(true);
    expect(chroniclesHeroProgress(valid.progression, 'matthias')).toMatchObject({
      attributePoints: 0,
      attributes: expect.objectContaining({ power: 1, precision: 0 }),
    });
  });

  it('enforces the explicit attribute cap', () => {
    const base = createChroniclesProgression();
    const capped = normalizeChroniclesProgression({
      ...base,
      heroes: {
        ...base.heroes,
        rook: {
          ...base.heroes.rook,
          attributePoints: 3,
          attributes: { ...base.heroes.rook.attributes, power: CHRONICLES_ATTRIBUTE_CAP },
        },
      },
    });
    const result = spendChroniclesAttributePoint(capped, 'rook', 'power');
    expect(result.spent).toBe(false);
    expect(result.reason).toMatch(/máximo/i);
    expect(chroniclesHeroProgress(result.progression, 'rook').attributes.power).toBe(CHRONICLES_ATTRIBUTE_CAP);
  });

  it('turns Vigor into real maximum HP at encounter start', () => {
    const progression = progressionWith('matthias', { vigor: 3 });
    const state = tacticsState(progression);
    const matthias = state.party.find((member) => member.id === 'matthias');
    expect(matthias.maxHp).toBe(10);
    expect(matthias.hp).toBe(10);
  });

  it('turns Potencia into physical damage instead of a decorative number', () => {
    const progression = progressionWith('matthias', { power: 2 });
    const state = tacticsState(progression, { x: 2, y: 5 });
    const after = chroniclesTacticsAttack(state, 'matthias', 'corrupted-pawn');
    expect(after.enemyHp).toBe(3);
  });

  it('turns Precisión into extra ranged reach and damage', () => {
    const progression = progressionWith('knight', { precision: 3 });
    const state = tacticsState(progression, {
      x: 1,
      y: 5,
      enemyPositions: { 'corrupted-pawn': { x: 5, y: 5 } },
    });
    expect(chroniclesTacticsTargets(state, 'knight')).toEqual([
      expect.objectContaining({ enemyId: 'corrupted-pawn', distance: 4 }),
    ]);
    const after = chroniclesTacticsAttack(state, 'knight', 'corrupted-pawn');
    expect(after.enemyHp).toBe(4);
  });

  it('turns Voluntad into stronger abilities and an extra charge restored by the rune core', () => {
    const progression = progressionWith('rook', { will: 3 });
    const state = tacticsState(progression);
    expect(state.classAbilityCharges.rook).toBe(2);

    const afterAbility = chroniclesTacticsAbility(state, 'rook');
    expect(afterAbility.enemyHp).toBe(1);
    expect(afterAbility.classAbilityCharges.rook).toBe(1);

    const depletedAtCore = {
      ...afterAbility,
      x: 5,
      y: 4,
      runeCacheOpened: true,
      runeCoreCollected: false,
      classAbilityCharges: { ...afterAbility.classAbilityCharges, rook: 0 },
    };
    const recharged = chroniclesTacticsUse(depletedAtCore, 'rune-core');
    expect(recharged.classAbilityCharges.rook).toBe(2);
  });

  it('lets Voluntad improve Aziz healing without reviving fallen heroes', () => {
    const progression = progressionWith('bishop', { will: 2 });
    const party = createChroniclesState().party.map((member) => (
      member.id === 'knight'
        ? { ...member, hp: 0 }
        : { ...member, hp: Math.max(1, member.hp - 3) }
    ));
    const state = tacticsState(progression, { party });
    const healed = chroniclesTacticsAbility(state, 'bishop');

    expect(healed.party.find((member) => member.id === 'matthias').hp).toBe(7);
    expect(healed.party.find((member) => member.id === 'knight').hp).toBe(0);
  });
});
