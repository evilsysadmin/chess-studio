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
    expect(chroniclesPartyAttackStats(state, 'matthias')).toMatchObject({
      damage: 2,
      reach: 1,
      toHit: 3,
    });
  });

  it('counts MM3 Might once in first-person damage and level + Accuracy in to-hit', () => {
    const progression = createChroniclesProgression();
    progression.characterBuild = {
      version: 2,
      mode: 'custom',
      characters: [
        { slotId: 'matthias', classId: 'barbarian', name: 'Greta', stats: { might: 17, intellect: 8, personality: 9, endurance: 16, speed: 12, accuracy: 13, luck: 10 } },
        { slotId: 'rook', classId: 'paladin', name: 'Hildegard', stats: { might: 14, intellect: 9, personality: 13, endurance: 15, speed: 10, accuracy: 11, luck: 11 } },
        { slotId: 'bishop', classId: 'sorcerer', name: 'Nadir', stats: { might: 7, intellect: 16, personality: 10, endurance: 9, speed: 12, accuracy: 12, luck: 12 } },
        { slotId: 'knight', classId: 'archer', name: 'Faust', stats: { might: 11, intellect: 13, personality: 10, endurance: 12, speed: 14, accuracy: 15, luck: 11 } },
      ],
    };

    const base = createChroniclesState(null, progression.characterBuild, { rules: 'mm3' });
    expect(base.party.find((member) => member.id === 'matthias')?.damage).toBe(4);

    const state = applyChroniclesProgressionToTacticsState(base, progression);
    expect(chroniclesPartyAttackStats(state, 'matthias')).toEqual({
      damage: 4,
      reach: 1,
      toHit: 2,
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
