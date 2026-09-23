import { describe, expect, it } from 'vitest';
import {
  createChroniclesProgression,
  grantChroniclesXp,
} from '../chroniclesOfMatthiasProgression.js';
import {
  chroniclesApplyRewardChoice,
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

  it('allows exactly one claimed choice per milestone', () => {
    const progression = levelTwoWithSkillPoint();
    const first = chroniclesRewardDraft({
      seed: 417,
      milestoneId: 'gallery-cleared',
      progression,
    });
    expect(first.length).toBeGreaterThan(0);

    const afterClaim = chroniclesRewardDraft({
      seed: 417,
      milestoneId: 'gallery-cleared',
      progression,
      claimedRewards: [first[1].choiceId],
    });

    expect(afterClaim).toEqual([]);
  });

  it('cools down only the most recent choice instead of exhausting the pool forever', () => {
    const progression = createChroniclesProgression();
    const first = chroniclesRewardDraft({
      seed: 733,
      milestoneId: 'menagerie-cleared',
      progression,
    });
    const firstChoice = first[0];

    const second = chroniclesRewardDraft({
      seed: 733,
      milestoneId: 'archive-cleared',
      progression,
      claimedRewards: [firstChoice.choiceId],
    });
    expect(second.some((choice) => choice.id === firstChoice.id)).toBe(false);
    expect(second.length).toBeGreaterThan(0);

    const secondChoice = second[0];
    const third = chroniclesRewardDraft({
      seed: 733,
      milestoneId: 'foundry-cleared',
      progression,
      claimedRewards: [firstChoice.choiceId, secondChoice.choiceId],
    });

    expect(third.some((choice) => choice.id === secondChoice.id)).toBe(false);
    expect(third.some((choice) => choice.id === firstChoice.id)).toBe(true);
  });

  it('applies a legal progression choice before claiming it', () => {
    const progression = levelTwoWithSkillPoint();
    const draft = chroniclesRewardDraft({
      seed: 417,
      milestoneId: 'gallery-cleared',
      progression,
    });
    const skill = draft.find((choice) => choice.kind === 'skill');

    const applied = chroniclesApplyRewardChoice({
      seed: 417,
      milestoneId: 'gallery-cleared',
      state: { claimedRewards: [] },
      progression,
      choiceId: skill.choiceId,
    });

    expect(applied.applied).toBe(true);
    expect(applied.progression.heroes.matthias.skills).toContain(skill.skillId);
    expect(applied.state.claimedRewards).toEqual([skill.choiceId]);

    const duplicate = chroniclesApplyRewardChoice({
      seed: 417,
      milestoneId: 'gallery-cleared',
      state: applied.state,
      progression: applied.progression,
      choiceId: skill.choiceId,
    });
    expect(duplicate.applied).toBe(false);
    expect(duplicate.state.claimedRewards).toEqual([skill.choiceId]);
  });

  it('does not claim a stale progression choice that is no longer legal', () => {
    const eligible = levelTwoWithSkillPoint();
    const skill = chroniclesRewardDraft({
      seed: 417,
      milestoneId: 'crypt-cleared',
      progression: eligible,
    }).find((choice) => choice.kind === 'skill');

    const stale = chroniclesApplyRewardChoice({
      seed: 417,
      milestoneId: 'crypt-cleared',
      state: { claimedRewards: [] },
      progression: createChroniclesProgression(),
      choiceId: skill.choiceId,
    });

    expect(stale.applied).toBe(false);
    expect(stale.state.claimedRewards).toEqual([]);
  });

  it('applies run effects through the authored content effect contract', () => {
    const progression = createChroniclesProgression();
    const draft = chroniclesRewardDraft({
      seed: 733,
      milestoneId: 'menagerie-cleared',
      progression,
    });
    const dressing = draft.find((choice) => choice.id === 'field-dressing');
    const state = {
      claimedRewards: [],
      party: [{ id: 'matthias', hp: 3, maxHp: 7 }],
    };

    const applied = chroniclesApplyRewardChoice({
      seed: 733,
      milestoneId: 'menagerie-cleared',
      state,
      progression,
      choiceId: dressing.choiceId,
    });

    expect(applied.applied).toBe(true);
    expect(applied.state.party[0].hp).toBe(5);
    expect(applied.state.claimedRewards).toEqual([dressing.choiceId]);
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
