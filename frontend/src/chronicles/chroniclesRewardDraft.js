import {
  CHRONICLES_ATTRIBUTE_DEFINITIONS,
  chroniclesAllowedAttributes,
  chroniclesHeroProgress,
  chroniclesSkillsForMember,
  normalizeChroniclesProgression,
  unlockChroniclesSkill,
} from '../chroniclesOfMatthiasProgression.js';

const HERO_IDS = Object.freeze(['matthias', 'rook', 'bishop', 'knight']);
const DEFAULT_LIMIT = 3;

const CHRONICLES_RUN_REWARD_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: 'field-dressing',
    kind: 'run-effect',
    label: 'Vendajes de campaña',
    description: 'Recupera 2 de vida a cada héroe que siga en pie.',
    effects: Object.freeze([Object.freeze({ type: 'heal-party', amount: 2 })]),
  }),
  Object.freeze({
    id: 'reserve-drill',
    kind: 'run-effect',
    label: 'Reserva táctica',
    description: 'Recupera las cargas de habilidades de clase para el siguiente tramo.',
    effects: Object.freeze([Object.freeze({ type: 'refill-class-abilities' })]),
  }),
]);

function stableHash(text) {
  let hash = 2166136261;
  for (const character of String(text)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function rewardWasClaimed(claimedRewards, candidateId) {
  const suffix = `:${candidateId}`;
  return (claimedRewards || []).some((claimId) => (
    typeof claimId === 'string'
    && claimId.startsWith('reward-choice:')
    && claimId.endsWith(suffix)
  ));
}

function milestoneWasClaimed(claimedRewards, milestoneId) {
  const prefix = `reward-choice:${milestoneId}:`;
  return (claimedRewards || []).some((claimId) => (
    typeof claimId === 'string' && claimId.startsWith(prefix)
  ));
}

function legalSkillCandidates(progression) {
  const current = normalizeChroniclesProgression(progression);
  return HERO_IDS.flatMap((memberId) => {
    const hero = chroniclesHeroProgress(current, memberId);
    if (hero.skillPoints <= 0) return [];
    return chroniclesSkillsForMember(memberId).flatMap((skill) => {
      const preview = unlockChroniclesSkill(current, memberId, skill.id);
      if (!preview.unlocked) return [];
      return [Object.freeze({
        id: `skill-${memberId}-${skill.id}`,
        kind: 'skill',
        memberId,
        skillId: skill.id,
        label: skill.label,
        description: skill.description,
        action: Object.freeze({ type: 'unlock-skill', memberId, skillId: skill.id }),
      })];
    });
  });
}

function legalAttributeCandidates(progression) {
  const current = normalizeChroniclesProgression(progression);
  return HERO_IDS.flatMap((memberId) => {
    const hero = chroniclesHeroProgress(current, memberId);
    if (hero.attributePoints <= 0) return [];
    return chroniclesAllowedAttributes(memberId)
      .filter((attributeKey) => Number(hero.attributes?.[attributeKey] || 0) < 5)
      .map((attributeKey) => Object.freeze({
        id: `attribute-${memberId}-${attributeKey}`,
        kind: 'attribute',
        memberId,
        attributeKey,
        label: CHRONICLES_ATTRIBUTE_DEFINITIONS[attributeKey]?.label || attributeKey,
        description: 'Invierte un punto de atributo disponible en este héroe.',
        action: Object.freeze({ type: 'spend-attribute', memberId, attributeKey }),
      }));
  });
}

function rank(seed, milestoneId, candidate) {
  return stableHash(`${seed}:${milestoneId}:${candidate.id}`);
}

function rankedCandidates(candidates, seed, milestoneId, claimedRewards) {
  return candidates
    .filter((candidate) => !rewardWasClaimed(claimedRewards, candidate.id))
    .map((candidate) => ({ candidate, score: rank(seed, milestoneId, candidate) }))
    .sort((left, right) => left.score - right.score || left.candidate.id.localeCompare(right.candidate.id))
    .map(({ candidate }) => candidate);
}

function contextualProgressionChoice(progression, seed, milestoneId, claimedRewards) {
  const skills = rankedCandidates(legalSkillCandidates(progression), seed, milestoneId, claimedRewards);
  if (skills.length) return skills[0];
  const attributes = rankedCandidates(legalAttributeCandidates(progression), seed, milestoneId, claimedRewards);
  return attributes[0] || null;
}

export function chroniclesRewardClaimId(milestoneId, candidateId) {
  const safeMilestone = String(milestoneId || '').trim();
  const safeCandidate = String(candidateId || '').trim();
  if (!safeMilestone || !safeCandidate) return '';
  return `reward-choice:${safeMilestone}:${safeCandidate}`;
}

export function chroniclesRewardDraft({
  seed,
  milestoneId,
  progression,
  claimedRewards = [],
  limit = DEFAULT_LIMIT,
} = {}) {
  const safeMilestone = String(milestoneId || '').trim();
  const safeLimit = Math.max(1, Math.min(DEFAULT_LIMIT, Math.floor(Number(limit) || DEFAULT_LIMIT)));
  if (!safeMilestone || !Number.isFinite(Number(seed))) return Object.freeze([]);
  if (milestoneWasClaimed(claimedRewards, safeMilestone)) return Object.freeze([]);

  const runChoices = rankedCandidates(
    CHRONICLES_RUN_REWARD_DEFINITIONS,
    Number(seed),
    safeMilestone,
    claimedRewards,
  );
  const contextual = contextualProgressionChoice(
    progression,
    Number(seed),
    safeMilestone,
    claimedRewards,
  );

  const choices = [];
  if (contextual) choices.push(contextual);
  runChoices.forEach((choice) => {
    if (choices.length < safeLimit) choices.push(choice);
  });

  return Object.freeze(choices.slice(0, safeLimit).map((choice) => Object.freeze({
    ...choice,
    choiceId: chroniclesRewardClaimId(safeMilestone, choice.id),
  })));
}
