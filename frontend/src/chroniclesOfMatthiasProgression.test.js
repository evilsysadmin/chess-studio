import { beforeEach, describe, expect, it } from 'vitest';
import { createChroniclesState } from './chroniclesOfMatthias.js';
import {
  CHRONICLES_PROGRESSION_STORAGE_KEY,
  CHRONICLES_TACTICS_RUN_STORAGE_KEY,
  applyChroniclesTacticsProgression,
  beginChroniclesTacticsRun,
  chroniclesHeroProgress,
  chroniclesXpThresholdForLevel,
  createChroniclesProgression,
  ensureChroniclesTacticsRun,
  finishChroniclesTacticsRun,
  grantChroniclesXp,
  loadChroniclesProgression,
  saveChroniclesProgression,
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
  beforeEach(() => {
    clearStorageMemoryFallback();
    localStorage.clear();
    localStorage.setItem('chess-study-auth-username', 'alice');
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

  it('creates a fresh run identity after the current expedition is finished', () => {
    const first = beginChroniclesTacticsRun();
    expect(ensureChroniclesTacticsRun()).toBe(first);

    expect(finishChroniclesTacticsRun(first)).toBe(true);

    const second = ensureChroniclesTacticsRun();
    expect(second).not.toBe(first);
    expect(ensureChroniclesTacticsRun()).toBe(second);
  });

  it('keeps an active run across reload but refuses to inherit it across users', () => {
    const aliceRun = beginChroniclesTacticsRun();
    expect(ensureChroniclesTacticsRun()).toBe(aliceRun);

    localStorage.setItem('chess-study-auth-username', 'bob');
    const bobRun = ensureChroniclesTacticsRun();
    expect(bobRun).not.toBe(aliceRun);

    const stored = JSON.parse(localStorage.getItem(CHRONICLES_TACTICS_RUN_STORAGE_KEY));
    expect(stored.owner).toBe('bob');
  });
});
