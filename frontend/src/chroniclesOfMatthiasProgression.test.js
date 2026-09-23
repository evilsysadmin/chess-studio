import { beforeEach, describe, expect, it } from 'vitest';
import { createChroniclesState } from './chroniclesOfMatthias.js';
import {
  CHRONICLES_PROGRESSION_STORAGE_KEY,
  CHRONICLES_RUN_STORAGE_KEY,
  CHRONICLES_TACTICS_RUN_STORAGE_KEY,
  applyChroniclesProgressionToTacticsState,
  applyChroniclesTacticsProgression,
  beginChroniclesTacticsRun,
  chroniclesCharacterBuild,
  chroniclesHeroProgress,
  chroniclesXpThresholdForLevel,
  createChroniclesProgression,
  ensureChroniclesTacticsRun,
  finishChroniclesTacticsRun,
  grantChroniclesXp,
  loadChroniclesProgression,
  reconcileChroniclesProgressionInTacticsState,
  renewChroniclesTacticsRun,
  saveChroniclesProgression,
  setChroniclesCharacterBuild,
  spendChroniclesAttributePoint,
  unlockChroniclesSkill,
} from './chroniclesOfMatthiasProgression.js';
import { clearStorageMemoryFallback } from './safeStorage.js';

function tacticsStateFor(mapId, overrides = {}) {
  return {
    ...createChroniclesState(mapId),
    round: 1,
    turnPhase: 'party',
    enemyPositions: {},
    enemyTurnEvents: [],
    ...overrides,
  };
}

function tacticsState(overrides = {}) {
  return tacticsStateFor('crypt-eight-squares', overrides);
}

describe('Chronicles Tactics · progression', () => {
  it('migrates legacy progression to the exact canonical character build', () => {
    const legacy = {
      version: 1,
      heroes: createChroniclesProgression().heroes,
      claimedAwards: [],
    };

    const build = chroniclesCharacterBuild(legacy);
    expect(build.mode).toBe('canonical');
    expect(build.characters.map((character) => character.name)).toEqual([
      'Matthias',
      'Hildegard',
      'Aziz',
      'Faust',
    ]);
  });

  it('persists a valid custom build and applies creator modifiers on top of RPG progression', () => {
    const base = createChroniclesProgression();
    const custom = {
      version: 1,
      mode: 'custom',
      characters: [
        {
          slotId: 'matthias',
          classId: 'matthias',
          name: 'Greta',
          attributes: { vigor: 1, power: 2 },
          startingSkillId: 'matthias-keen-point',
        },
        { slotId: 'rook', classId: 'rook', name: 'Hildegard', attributes: {}, startingSkillId: null },
        {
          slotId: 'bishop',
          classId: 'bishop',
          name: 'Nadir',
          attributes: { precision: 2, will: 1 },
          startingSkillId: 'bishop-long-diagonal',
        },
        { slotId: 'knight', classId: 'knight', name: 'Faust', attributes: {}, startingSkillId: null },
      ],
    };

    const selected = setChroniclesCharacterBuild(base, custom);
    expect(selected.updated).toBe(true);
    const saved = saveChroniclesProgression(selected.progression);
    expect(loadChroniclesProgression().characterBuild.characters[0].name).toBe('Greta');

    const tactics = applyChroniclesProgressionToTacticsState(
      createChroniclesState(null, saved.characterBuild),
      saved,
    );
    expect(tactics.party.find((member) => member.id === 'matthias')?.maxHp).toBe(8);
    expect(tactics.rpgModifiers.matthias.attackDamageBonus).toBe(2);
    expect(tactics.rpgModifiers.bishop.reachBonus).toBe(2);
  });

  beforeEach(() => {
    clearStorageMemoryFallback();
    localStorage.clear();
    localStorage.setItem('chess-study-auth-username', 'alice');
  });

  it('applies spent progression to the live tactical state without healing existing damage', () => {
    const leveled = grantChroniclesXp(
      createChroniclesProgression(),
      'rook',
      chroniclesXpThresholdForLevel(2),
      'fixture:live-vigor',
    ).progression;
    const initial = applyChroniclesProgressionToTacticsState(tacticsState(), leveled);
    const rookIndex = initial.party.findIndex((member) => member.id === 'rook');
    const wounded = {
      ...initial,
      party: initial.party.map((member, index) => (
        index === rookIndex ? { ...member, hp: Math.max(0, member.hp - 2) } : member
      )),
    };
    const before = wounded.party[rookIndex];
    const spent = spendChroniclesAttributePoint(leveled, 'rook', 'vigor');

    expect(spent.spent).toBe(true);
    const reconciled = reconcileChroniclesProgressionInTacticsState(wounded, spent.progression);
    const after = reconciled.party[rookIndex];

    expect(after.maxHp).toBe(before.maxHp + 1);
    expect(after.hp).toBe(before.hp);
    expect(reconciled.rpgModifiers.rook.bonusMaxHp).toBe(initial.rpgModifiers.rook.bonusMaxHp + 1);
  });

  it('adds newly unlocked ability capacity without refilling charges already spent', () => {
    const base = createChroniclesProgression();
    const veteran = {
      ...base,
      heroes: {
        ...base.heroes,
        rook: {
          ...base.heroes.rook,
          xp: chroniclesXpThresholdForLevel(6),
          skillPoints: 1,
        },
      },
    };
    const initial = applyChroniclesProgressionToTacticsState(tacticsState(), veteran);
    const spentState = {
      ...initial,
      classAbilityCharges: {
        ...initial.classAbilityCharges,
        rook: 0,
      },
    };
    const learned = unlockChroniclesSkill(veteran, 'rook', 'rook-reserve-hammer');

    expect(learned.unlocked).toBe(true);
    const reconciled = reconcileChroniclesProgressionInTacticsState(spentState, learned.progression);

    expect(initial.rpgModifiers.rook.abilityCharges).toBe(1);
    expect(reconciled.rpgModifiers.rook.abilityCharges).toBe(2);
    expect(reconciled.classAbilityCharges.rook).toBe(1);
  });

  it('turns XP into bounded levels, attribute points and skill points', () => {
    const base = createChroniclesProgression();
    const levelTwoXp = chroniclesXpThresholdForLevel(2);
    const result = grantChroniclesXp(base, 'matthias', levelTwoXp, 'fixture:level-two');
    const hero = chroniclesHeroProgress(result.progression, 'matthias');

    expect(hero.level).toBe(2);
    expect(hero.xp).toBe(levelTwoXp);
    expect(hero.attributePoints).toBe(1);
    expect(hero.skillPoints).toBe(1);
    expect(result.levelUps).toEqual([{ memberId: 'matthias', from: 1, to: 2 }]);
  });

  it('never pays the same award twice', () => {
    const base = createChroniclesProgression();
    const first = grantChroniclesXp(base, 'rook', 12, 'crypt-01:fixture');
    const duplicate = grantChroniclesXp(first.progression, 'rook', 12, 'crypt-01:fixture');

    expect(first.awarded).toBe(12);
    expect(duplicate.awarded).toBe(0);
    expect(duplicate.duplicate).toBe(true);
    expect(chroniclesHeroProgress(duplicate.progression, 'rook').xp).toBe(12);
  });

  it('uses a fixed encounter XP budget inside one run but rewards a genuinely new expedition', () => {
    const before = tacticsState({ enemyHp: 6 });
    const after = tacticsState({ enemyHp: 0 });
    const first = applyChroniclesTacticsProgression(createChroniclesProgression(), before, after, {
      actorMemberId: 'rook',
      actionKind: 'ability',
      runId: 'run-before-f5',
    });
    const replay = applyChroniclesTacticsProgression(first.progression, before, after, {
      actorMemberId: 'rook',
      actionKind: 'ability',
      runId: 'run-before-f5',
    });
    const freshRun = applyChroniclesTacticsProgression(replay.progression, before, after, {
      actorMemberId: 'rook',
      actionKind: 'ability',
      runId: 'next-expedition',
    });

    expect(first.awards.some((award) => award.reason === 'daño útil')).toBe(true);
    expect(first.awards.some((award) => award.reason === 'baja')).toBe(true);
    expect(replay.awards).toEqual([]);
    expect(freshRun.awards.some((award) => award.reason === 'daño útil')).toBe(true);
    expect(freshRun.awards.some((award) => award.reason === 'baja')).toBe(true);
    expect(chroniclesHeroProgress(freshRun.progression, 'rook').xp)
      .toBeGreaterThan(chroniclesHeroProgress(first.progression, 'rook').xp);
  });

  it('does not let legacy cross-run claim ids poison future expeditions', () => {
    const seeded = grantChroniclesXp(
      createChroniclesProgression(),
      'rook',
      2,
      'crypt-01:damage:corrupted-pawn:hp-5',
    ).progression;
    const before = tacticsState({ enemyHp: 6 });
    const after = tacticsState({ enemyHp: 5 });

    const result = applyChroniclesTacticsProgression(seeded, before, after, {
      actorMemberId: 'rook',
      actionKind: 'attack',
      runId: 'legacy-profile',
    });

    expect(result.awards).toContainEqual(expect.objectContaining({
      awardId: 'legacy-profile:crypt-01:damage:corrupted-pawn:hp-5',
      reason: 'daño útil',
    }));
    expect(chroniclesHeroProgress(result.progression, 'rook').xp).toBe(4);
  });

  it('gives each map an independent finite XP budget even when enemy ids are reused', () => {
    const cryptBefore = tacticsState({ enemyHp: 6 });
    const cryptAfter = tacticsState({ enemyHp: 5 });
    const crypt = applyChroniclesTacticsProgression(createChroniclesProgression(), cryptBefore, cryptAfter, {
      actorMemberId: 'rook',
      actionKind: 'attack',
      runId: 'campaign-run',
    });

    const galleryBefore = tacticsStateFor('gallery-of-forks', { enemyHp: 8 });
    const galleryAfter = tacticsStateFor('gallery-of-forks', { enemyHp: 7 });
    const gallery = applyChroniclesTacticsProgression(crypt.progression, galleryBefore, galleryAfter, {
      actorMemberId: 'rook',
      actionKind: 'attack',
      runId: 'campaign-run',
    });

    expect(crypt.awards).toContainEqual(expect.objectContaining({
      awardId: 'campaign-run:crypt-01:damage:corrupted-pawn:hp-5',
      reason: 'daño útil',
    }));
    expect(gallery.awards).toContainEqual(expect.objectContaining({
      awardId: 'campaign-run:gallery-01:damage:corrupted-pawn:hp-7',
      reason: 'daño útil',
    }));
  });

  it('ignores stale HP belonging to enemies outside the active map', () => {
    const before = tacticsStateFor('gallery-of-forks', { spectralBishopHp: 3 });
    const after = { ...before, spectralBishopHp: 2 };

    const result = applyChroniclesTacticsProgression(createChroniclesProgression(), before, after, {
      actorMemberId: 'rook',
      actionKind: 'attack',
      runId: 'gallery-run',
    });

    expect(result.awards).toEqual([]);
    expect(chroniclesHeroProgress(result.progression, 'rook').xp).toBe(0);
  });

  it('deduplicates objective, support and survival rewards inside a run but pays them in a new run', () => {
    const wounded = createChroniclesState().party.map((member) => ({ ...member, hp: Math.max(1, member.hp - 2) }));
    const healed = wounded.map((member) => ({ ...member, hp: Math.min(member.maxHp, member.hp + 2) }));
    const before = tacticsState({ party: wounded, sigilAwake: false, phase: 'explore' });
    const after = tacticsState({ party: healed, sigilAwake: true, phase: 'escaped' });

    const first = applyChroniclesTacticsProgression(createChroniclesProgression(), before, after, {
      actorMemberId: 'bishop',
      actionKind: 'ability',
      runId: 'first-run',
    });
    const replay = applyChroniclesTacticsProgression(first.progression, before, after, {
      actorMemberId: 'bishop',
      actionKind: 'ability',
      runId: 'first-run',
    });
    const freshRun = applyChroniclesTacticsProgression(replay.progression, before, after, {
      actorMemberId: 'bishop',
      actionKind: 'ability',
      runId: 'second-run',
    });

    expect(first.awards.some((award) => award.reason === 'soporte efectivo')).toBe(true);
    expect(first.awards.some((award) => award.reason === 'objetivo')).toBe(true);
    expect(first.awards.filter((award) => award.reason === 'supervivencia')).toHaveLength(4);
    expect(replay.awards).toEqual([]);
    expect(freshRun.awards.some((award) => award.reason === 'soporte efectivo')).toBe(true);
    expect(freshRun.awards.some((award) => award.reason === 'objetivo')).toBe(true);
    expect(freshRun.awards.filter((award) => award.reason === 'supervivencia')).toHaveLength(4);
  });

  it('persists progression through the registered profile key', () => {
    const awarded = grantChroniclesXp(createChroniclesProgression(), 'knight', 18, 'fixture:persist').progression;
    saveChroniclesProgression(awarded);
    const restored = loadChroniclesProgression();

    expect(localStorage.getItem(CHRONICLES_PROGRESSION_STORAGE_KEY)).toBeTruthy();
    expect(chroniclesHeroProgress(restored, 'knight').xp).toBe(18);
  });

  it('does not let the legacy v1 run key pin a fresh expedition after the random-entry fix', () => {
    localStorage.setItem('chess-study-chronicles-tactics-run-v1', JSON.stringify({
      id: 'legacy-crypt-run',
      owner: 'alice',
      ended: false,
    }));

    expect(CHRONICLES_TACTICS_RUN_STORAGE_KEY).toBe('chess-study-chronicles-tactics-run-v2');
    const current = ensureChroniclesTacticsRun();
    expect(current).not.toBe('legacy-crypt-run');

    const stored = JSON.parse(localStorage.getItem(CHRONICLES_RUN_STORAGE_KEY));
    expect(stored.id).toBe(current);
    expect(stored.owner).toBe('alice');
    expect(stored.ended).toBe(false);
  });

  it('creates a fresh run identity after the current expedition is finished', () => {
    const first = beginChroniclesTacticsRun();
    expect(ensureChroniclesTacticsRun()).toBe(first);

    expect(finishChroniclesTacticsRun(first)).toBe(true);

    const second = ensureChroniclesTacticsRun();
    expect(second).not.toBe(first);
    expect(ensureChroniclesTacticsRun()).toBe(second);
  });

  it('renews a stale active run once without clobbering a newer replacement', () => {
    const staleRun = beginChroniclesTacticsRun();
    const replacement = renewChroniclesTacticsRun(staleRun);

    expect(replacement).not.toBe(staleRun);
    expect(ensureChroniclesTacticsRun()).toBe(replacement);
    expect(renewChroniclesTacticsRun(staleRun)).toBe(replacement);
    expect(ensureChroniclesTacticsRun()).toBe(replacement);
  });

  it('keeps an active run across reload but refuses to inherit it across users', () => {
    const aliceRun = beginChroniclesTacticsRun();
    expect(ensureChroniclesTacticsRun()).toBe(aliceRun);

    localStorage.setItem('chess-study-auth-username', 'bob');
    const bobRun = ensureChroniclesTacticsRun();
    expect(bobRun).not.toBe(aliceRun);

    const stored = JSON.parse(localStorage.getItem(CHRONICLES_RUN_STORAGE_KEY));
    expect(stored.owner).toBe('bob');
  });
});
