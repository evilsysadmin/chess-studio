import { describe, expect, it } from 'vitest';
import {
  CHRONICLES_ENEMIES,
  chroniclesPartyAttackStats,
  createChroniclesState,
} from './chroniclesOfMatthias.js';
import {
  applyChroniclesProgressionToTacticsState,
  applyChroniclesTacticsProgression,
  chroniclesHeroProgress,
  createChroniclesProgression,
  grantChroniclesXp,
  spendChroniclesAttributePoint,
} from './chroniclesOfMatthiasProgression.js';

describe('Chronicles first-person RPG progression', () => {
  it('applies persistent attribute bonuses to real first-person attack stats', () => {
    let progression = createChroniclesProgression();
    progression = grantChroniclesXp(progression, 'matthias', 120, 'test:level-3').progression;
    progression = spendChroniclesAttributePoint(progression, 'matthias', 'power').progression;
    progression = spendChroniclesAttributePoint(progression, 'matthias', 'power').progression;

    const state = applyChroniclesProgressionToTacticsState(createChroniclesState(), progression);
    expect(chroniclesHeroProgress(progression, 'matthias')).toMatchObject({
      level: 3,
      attributes: { power: 2 },
    });
    expect(chroniclesPartyAttackStats(state, 'matthias')).toEqual({
      damage: 2,
      reach: 1,
    });
  });

  it('does not double-count creator damage and reach bonuses in first-person', () => {
    const progression = createChroniclesProgression();
    progression.characterBuild = {
      version: 1,
      mode: 'custom',
      characters: [
        {
          slotId: 'matthias',
          classId: 'matthias',
          name: 'Matthias',
          attributes: { vigor: 0, power: 0, precision: 0, will: 0 },
          startingSkillId: 'matthias-keen-point',
        },
        { slotId: 'rook', classId: 'rook', name: 'Hildegard', attributes: {}, startingSkillId: null },
        { slotId: 'bishop', classId: 'bishop', name: 'Aziz', attributes: {}, startingSkillId: null },
        { slotId: 'knight', classId: 'knight', name: 'Faust', attributes: {}, startingSkillId: null },
      ],
    };

    const base = createChroniclesState(null, progression.characterBuild);
    expect(base.party.find((member) => member.id === 'matthias')?.damage).toBe(2);

    const state = applyChroniclesProgressionToTacticsState(base, progression);
    expect(chroniclesPartyAttackStats(state, 'matthias')).toEqual({
      damage: 2,
      reach: 1,
    });
  });

  it('keeps XP across maps and refuses to award the same kill twice', () => {
    const progression = createChroniclesProgression();
    const previous = createChroniclesState();
    const enemy = CHRONICLES_ENEMIES[0];
    const defeated = { ...previous, [enemy.hpKey]: 0 };

    const first = applyChroniclesTacticsProgression(progression, previous, defeated, {
      actorMemberId: 'matthias',
      actionKind: 'attack',
      runId: 'first-person-run',
    });
    expect(first.awards.some((award) => award.reason === 'baja')).toBe(true);
    const xpAfterKill = chroniclesHeroProgress(first.progression, 'matthias').xp;
    expect(xpAfterKill).toBeGreaterThan(0);

    const replay = applyChroniclesTacticsProgression(first.progression, previous, defeated, {
      actorMemberId: 'matthias',
      actionKind: 'attack',
      runId: 'first-person-run',
    });
    expect(replay.awards).toEqual([]);
    expect(chroniclesHeroProgress(replay.progression, 'matthias').xp).toBe(xpAfterKill);

    const nextLevelState = applyChroniclesProgressionToTacticsState(
      createChroniclesState('gallery-of-forks'),
      replay.progression,
    );
    expect(nextLevelState.party.find((member) => member.id === 'matthias')).toBeTruthy();
    expect(chroniclesHeroProgress(replay.progression, 'matthias').xp).toBe(xpAfterKill);
  });
});
