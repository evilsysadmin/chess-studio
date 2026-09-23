import { describe, expect, it } from 'vitest';
import {
  createChroniclesProgression,
  grantChroniclesXp,
} from '../chroniclesOfMatthiasProgression.js';
import {
  chroniclesRewardClaimId,
  chroniclesRewardDraft,
} from './chroniclesRewardDraft.js';

function levelTwoWithSkillPoint(memberId = 'matthias') {
  const base = createChroniclesProgression();
  return grantChroniclesXp(base, memberId, 120, `setup:${memberId}`).progression;
}

describe('Chronicles seeded reward drafts', () => {
  it('is reproducible for the same run seed and milestone', () => {
    const progression = levelTwoWithSkillPoint();
    const first = chroniclesRewardDraft({
      seed: 417,
      milestoneId: 'gallery-cleared',
      progression,
    });
    const second = chroniclesRewardDraft({
      seed: 417,
      milestoneId: 'gallery-cleared',
      progression,
    });

    expect(second).toEqual(first);
    expect(first).toHaveLength(3);
    expect(new Set(first.map((choice) => choice.id)).size).toBe(first.length);
  });

  it('only proposes progression actions that are currently legal', () => {
    const noPoints = chroniclesRewardDraft({
      seed: 417,
      milestoneId: 'crypt-cleared',
      progression: createChroniclesProgression(),
    });
    expect(noPoints.some((choice) => choice.kind === 'skill' || choice.kind === 'attribute')).toBe(false);

    const withPoints = chroniclesRewardDraft({
      seed: 417,
      milestoneId: 'crypt-cleared',
      progression: levelTwoWithSkillPoint(),
    });
    const skill = withPoints.find((choice) => choice.kind === 'skill');

    expect(skill).toBeTruthy();
    expect(skill.memberId).toBe('matthias');
    expect(skill.action).toEqual({
      type: 'unlock-skill',
      memberId: 'matthias',
      skillId: skill.skillId,
    });
  });

  it('does not continuously repeat choices already claimed in earlier milestones', () => {
    const progression = levelTwoWithSkillPoint();
    const first = chroniclesRewardDraft({
      seed: 733,
      milestoneId: 'menagerie-cleared',
      progression,
    });
    const claimedRewards = first.map((choice) => choice.choiceId);

    const later = chroniclesRewardDraft({
      seed: 733,
      milestoneId: 'archive-cleared',
      progression,
      claimedRewards,
    });

    expect(later.every((choice) => !first.some((old) => old.id === choice.id))).toBe(true);
  });

  it('builds stable claim ids and rejects invalid draft identity', () => {
    expect(chroniclesRewardClaimId('archive-cleared', 'field-dressing'))
      .toBe('reward-choice:archive-cleared:field-dressing');
    expect(chroniclesRewardDraft({
      seed: Number.NaN,
      milestoneId: 'archive-cleared',
      progression: createChroniclesProgression(),
    })).toEqual([]);
    expect(chroniclesRewardDraft({
      seed: 1,
      milestoneId: '',
      progression: createChroniclesProgression(),
    })).toEqual([]);
  });
});
