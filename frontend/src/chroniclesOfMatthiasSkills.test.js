import { beforeEach, describe, expect, it } from 'vitest';
import { CHRONICLES_ENEMIES, createChroniclesState } from './chroniclesOfMatthias.js';
import {
  applyChroniclesProgressionToTacticsState,
  applyChroniclesTacticsProgression,
  chroniclesHeroProgress,
  chroniclesSkillsForMember,
  chroniclesXpThresholdForLevel,
  createChroniclesProgression,
  grantChroniclesXp,
  loadChroniclesProgression,
  saveChroniclesProgression,
  unlockChroniclesSkill,
} from './chroniclesOfMatthiasProgression.js';
import {
  chroniclesTacticsAbility,
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
      const skills = chroniclesSkillsForMember(memberId);
      expect(skills).toHaveLength(2);
      expect(skills.every((skill) => skill.requiredLevel === 2 && skill.cost === 1)).toBe(true);
      expect(new Set(skills.map((skill) => skill.group)).size).toBe(1);
    }
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

  it('makes Faust choose between heavier bolts and an extra volley charge', () => {
    const heavy = tacticsState(withSkill('knight', 'knight-heavy-bolts'));
    expect(chroniclesTacticsAttack(heavy, 'knight', 'corrupted-pawn').enemyHp).toBe(4);

    const quiver = tacticsState(withSkill('knight', 'knight-double-quiver'));
    expect(quiver.classAbilityCharges.knight).toBe(2);
    const afterVolley = chroniclesTacticsAbility(quiver, 'knight');
    expect(afterVolley.classAbilityCharges.knight).toBe(1);
  });

  it('blocks duplicate XP inside one run but rewards the same encounter in a new run', () => {
    const previous = createChroniclesState();
    const enemy = CHRONICLES_ENEMIES[0];
    const next = { ...previous, [enemy.hpKey]: Math.max(0, previous[enemy.hpKey] - 1) };

    const first = applyChroniclesTacticsProgression(createChroniclesProgression(), previous, next, {
      actorMemberId: 'matthias',
      actionKind: 'attack',
      runId: 'run-a',
    });
    expect(first.awards.some((award) => award.reason === 'daño útil')).toBe(true);

    const duplicate = applyChroniclesTacticsProgression(first.progression, previous, next, {
      actorMemberId: 'matthias',
      actionKind: 'attack',
      runId: 'run-a',
    });
    expect(duplicate.awards).toHaveLength(0);

    const freshRun = applyChroniclesTacticsProgression(first.progression, previous, next, {
      actorMemberId: 'matthias',
      actionKind: 'attack',
      runId: 'run-b',
    });
    expect(freshRun.awards.some((award) => award.reason === 'daño útil')).toBe(true);
  });
});
