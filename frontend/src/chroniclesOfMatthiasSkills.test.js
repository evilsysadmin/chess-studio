import { beforeEach, describe, expect, it } from 'vitest';
import { createChroniclesState } from './chroniclesOfMatthias.js';
import {
  applyChroniclesProgressionToTacticsState,
  chroniclesHasUnspentProgression,
  chroniclesHeroProgress,
  chroniclesSkillsForMember,
  chroniclesXpThresholdForLevel,
  createChroniclesProgression,
  grantChroniclesXp,
  loadChroniclesProgression,
  saveChroniclesProgression,
  spendChroniclesAttributePoint,
  unlockChroniclesSkill,
} from './chroniclesOfMatthiasProgression.js';
import {
  chroniclesTacticsAbility,
  chroniclesTacticsAbilityStatus,
  chroniclesTacticsAttack,
} from './chroniclesOfMatthiasTactics.js';
import { clearStorageMemoryFallback } from './safeStorage.js';

function leveled(memberId, level = 2) {
  return grantChroniclesXp(
    createChroniclesProgression(),
    memberId,
    chroniclesXpThresholdForLevel(level),
    `fixture:${memberId}:level-${level}`,
  ).progression;
}

function withSkill(memberId, skillId) {
  const result = unlockChroniclesSkill(leveled(memberId), memberId, skillId);
  expect(result.unlocked).toBe(true);
  return result.progression;
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

describe('Chronicles Tactics · class doctrine skills', () => {
  beforeEach(() => {
    clearStorageMemoryFallback();
    localStorage.clear();
    localStorage.setItem('chess-study-auth-username', 'alice');
  });

  it('offers two real doctrine choices per class at level 2', () => {
    for (const memberId of ['matthias', 'rook', 'bishop', 'knight']) {
      const skills = chroniclesSkillsForMember(memberId).filter((skill) => skill.requiredLevel === 2);
      expect(skills).toHaveLength(2);
      expect(skills.every((skill) => skill.cost === 1)).toBe(true);
      expect(new Set(skills.map((skill) => skill.group)).size).toBe(1);
    }
  });

  it('offers a second mutually exclusive build choice at level 4 for every hero', () => {
    for (const memberId of ['matthias', 'rook', 'bishop', 'knight']) {
      const levelFour = chroniclesSkillsForMember(memberId).filter((skill) => skill.requiredLevel === 4);
      expect(levelFour).toHaveLength(2);
      expect(levelFour.every((skill) => skill.cost === 1)).toBe(true);
      expect(new Set(levelFour.map((skill) => skill.group)).size).toBe(1);
    }
  });

  it('flags a hero only while real level-up points remain unspent', () => {
    const levelTwo = leveled('matthias', 2);
    expect(chroniclesHasUnspentProgression(levelTwo, 'matthias')).toBe(true);

    const learned = unlockChroniclesSkill(levelTwo, 'matthias', 'matthias-steel-tempo');
    expect(learned.unlocked).toBe(true);
    expect(chroniclesHasUnspentProgression(learned.progression, 'matthias')).toBe(true);

    const spent = spendChroniclesAttributePoint(learned.progression, 'matthias', 'vigor');
    expect(spent.spent).toBe(true);
    expect(chroniclesHasUnspentProgression(spent.progression, 'matthias')).toBe(false);
  });

  it('opens a second Aziz grimoire page at level 6', () => {
    const spells = chroniclesSkillsForMember('bishop').filter((skill) => skill.requiredLevel === 6);
    expect(spells).toHaveLength(2);
    expect(spells.map((spell) => spell.group)).toEqual(['grimoire-2', 'grimoire-2']);

    const levelSix = leveled('bishop', 6);
    const solar = unlockChroniclesSkill(levelSix, 'bishop', 'bishop-solar-lance');
    expect(solar.unlocked).toBe(true);
    expect(unlockChroniclesSkill(solar.progression, 'bishop', 'bishop-aurora-liturgy').unlocked).toBe(false);

    const attackState = tacticsState(solar.progression, {
      x: 1,
      y: 5,
      enemyPositions: { 'corrupted-pawn': { x: 2, y: 4 } },
    });
    expect(chroniclesTacticsAbilityStatus(attackState, 'bishop').abilityName).toBe('Lanza solar');
    expect(chroniclesTacticsAbility(attackState, 'bishop').enemyHp).toBe(1);

    const aurora = unlockChroniclesSkill(levelSix, 'bishop', 'bishop-aurora-liturgy');
    expect(aurora.unlocked).toBe(true);
    const woundedParty = createChroniclesState().party.map((member) => ({
      ...member,
      hp: Math.max(1, member.hp - 5),
    }));
    const healState = tacticsState(aurora.progression, { party: woundedParty });
    expect(chroniclesTacticsAbilityStatus(healState, 'bishop').abilityName).toBe('Liturgia de la aurora');
    expect(chroniclesTacticsAbility(healState, 'bishop').party.find((member) => member.id === 'matthias').hp).toBe(6);
  });

  it('refuses skills before their required level', () => {
    const result = unlockChroniclesSkill(createChroniclesProgression(), 'matthias', 'matthias-steel-tempo');
    expect(result.unlocked).toBe(false);
    expect(result.reason).toMatch(/nivel 2/i);
  });

  it('spends a skill point and permanently closes the sibling doctrine', () => {
    const highEnough = leveled('matthias', 4);
    expect(chroniclesHeroProgress(highEnough, 'matthias').skillPoints).toBe(2);

    const first = unlockChroniclesSkill(highEnough, 'matthias', 'matthias-steel-tempo');
    expect(first.unlocked).toBe(true);
    expect(chroniclesHeroProgress(first.progression, 'matthias')).toMatchObject({
      skillPoints: 1,
      skills: ['matthias-steel-tempo'],
    });

    const competing = unlockChroniclesSkill(first.progression, 'matthias', 'matthias-master-rupture');
    expect(competing.unlocked).toBe(false);
    expect(competing.reason).toMatch(/doctrina ya fijada/i);
    expect(chroniclesHeroProgress(competing.progression, 'matthias').skillPoints).toBe(1);
  });

  it('persists the chosen doctrine as profile progression', () => {
    const progression = withSkill('knight', 'knight-double-quiver');
    saveChroniclesProgression(progression);
    const restored = loadChroniclesProgression();
    expect(chroniclesHeroProgress(restored, 'knight').skills).toEqual(['knight-double-quiver']);
  });

  it('makes Matthias choose between stronger basic pressure and stronger Ruptura', () => {
    const tempo = tacticsState(withSkill('matthias', 'matthias-steel-tempo'), { x: 2, y: 5 });
    expect(chroniclesTacticsAttack(tempo, 'matthias', 'corrupted-pawn').enemyHp).toBe(3);

    const rupture = tacticsState(withSkill('matthias', 'matthias-master-rupture'), { x: 2, y: 5 });
    const afterRupture = chroniclesTacticsAbility(rupture, 'matthias');
    expect(afterRupture.enemyHp).toBe(0);
  });

  it('makes Hildegard Muralla viva increase real encounter HP', () => {
    const state = tacticsState(withSkill('rook', 'rook-living-wall'));
    const hildegard = state.party.find((member) => member.id === 'rook');
    expect(hildegard.maxHp).toBe(12);
    expect(hildegard.hp).toBe(12);
  });

  it('makes level-4 build choices alter reach, durability or ability pressure', () => {
    const matthiasLevelFour = leveled('matthias', 4);
    const longPoint = unlockChroniclesSkill(matthiasLevelFour, 'matthias', 'matthias-long-point');
    expect(longPoint.unlocked).toBe(true);
    expect(tacticsState(longPoint.progression).rpgModifiers.matthias.reachBonus).toBe(1);

    const rookLevelFour = leveled('rook', 4);
    const bastion = unlockChroniclesSkill(rookLevelFour, 'rook', 'rook-bastion');
    expect(bastion.unlocked).toBe(true);
    const rook = tacticsState(bastion.progression).party.find((member) => member.id === 'rook');
    expect(rook.maxHp).toBe(13);

    const knightLevelFour = leveled('knight', 4);
    const killZone = unlockChroniclesSkill(knightLevelFour, 'knight', 'knight-kill-zone');
    expect(killZone.unlocked).toBe(true);
    expect(tacticsState(killZone.progression).rpgModifiers.knight.abilityPotencyBonus).toBe(2);
  });

  it('makes Aziz choose between stronger healing and stronger diagonal damage', () => {
    const woundedParty = createChroniclesState().party.map((member) => ({ ...member, hp: Math.max(1, member.hp - 3) }));
    const lumen = tacticsState(withSkill('bishop', 'bishop-lumen-maior'), { party: woundedParty });
    const healed = chroniclesTacticsAbility(lumen, 'bishop');
    expect(healed.party.find((member) => member.id === 'matthias').hp).toBe(7);

    const geometry = tacticsState(withSkill('bishop', 'bishop-sacred-geometry'), {
      x: 1,
      y: 5,
      enemyPositions: { 'corrupted-pawn': { x: 2, y: 4 } },
    });
    expect(chroniclesTacticsAttack(geometry, 'bishop', 'corrupted-pawn').enemyHp).toBe(3);
  });

  it('unlocks one level-4 spell branch and changes the real ability', () => {
    const levelFour = leveled('bishop', 4);
    expect(chroniclesHeroProgress(levelFour, 'bishop').skillPoints).toBe(2);

    const dawn = unlockChroniclesSkill(levelFour, 'bishop', 'bishop-dawn-orb');
    expect(dawn.unlocked).toBe(true);
    const competing = unlockChroniclesSkill(dawn.progression, 'bishop', 'bishop-twin-lumen');
    expect(competing.unlocked).toBe(false);

    const woundedParty = createChroniclesState().party.map((member) => ({
      ...member,
      hp: Math.max(1, member.hp - 4),
    }));
    const dawnState = tacticsState(dawn.progression, { party: woundedParty });
    expect(chroniclesTacticsAbilityStatus(dawnState, 'bishop').abilityName).toBe('Orbe de alba');
    const healed = chroniclesTacticsAbility(dawnState, 'bishop');
    expect(healed.party.find((member) => member.id === 'matthias').hp).toBe(7);

    const twin = unlockChroniclesSkill(levelFour, 'bishop', 'bishop-twin-lumen');
    expect(twin.unlocked).toBe(true);
    const twinState = tacticsState(twin.progression, { party: woundedParty });
    expect(chroniclesTacticsAbilityStatus(twinState, 'bishop')).toMatchObject({
      abilityName: 'Lumen geminado',
      charges: 2,
    });
  });

  it('makes Faust choose between heavier bolts and an extra volley charge', () => {
    const heavy = tacticsState(withSkill('knight', 'knight-heavy-bolts'));
    expect(chroniclesTacticsAttack(heavy, 'knight', 'corrupted-pawn').enemyHp).toBe(4);

    const quiver = tacticsState(withSkill('knight', 'knight-double-quiver'));
    expect(quiver.classAbilityCharges.knight).toBe(2);
    const afterVolley = chroniclesTacticsAbility(quiver, 'knight');
    expect(afterVolley.classAbilityCharges.knight).toBe(1);
  });
});
