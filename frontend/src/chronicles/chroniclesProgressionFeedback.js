function normalizeAward(award) {
  if (!award || typeof award !== 'object') return null;
  const memberId = String(award.memberId || '').trim();
  const xp = Math.max(0, Math.floor(Number(award.xp) || 0));
  if (!memberId || xp <= 0) return null;
  return {
    memberId,
    xp,
    reason: String(award.reason || '').trim(),
  };
}

function normalizeLevelUp(levelUp) {
  if (!levelUp || typeof levelUp !== 'object') return null;
  const memberId = String(levelUp.memberId || '').trim();
  const from = Math.max(1, Math.floor(Number(levelUp.from) || 1));
  const to = Math.max(from, Math.floor(Number(levelUp.to) || from));
  if (!memberId || to <= from) return null;
  return { memberId, from, to };
}

export function chroniclesProgressionFeedback(progressResult) {
  const awards = (progressResult?.awards || []).map(normalizeAward).filter(Boolean);
  const levelUps = (progressResult?.levelUps || []).map(normalizeLevelUp).filter(Boolean);
  const memberIds = [...new Set([
    ...awards.map((award) => award.memberId),
    ...levelUps.map((levelUp) => levelUp.memberId),
  ])];

  const heroes = memberIds.map((memberId) => {
    const memberAwards = awards.filter((award) => award.memberId === memberId);
    const memberLevelUps = levelUps.filter((levelUp) => levelUp.memberId === memberId);
    const xp = memberAwards.reduce((total, award) => total + award.xp, 0);
    const reasons = [...new Set(memberAwards.map((award) => award.reason).filter(Boolean))];
    const fromLevel = memberLevelUps.length
      ? Math.min(...memberLevelUps.map((levelUp) => levelUp.from))
      : null;
    const toLevel = memberLevelUps.length
      ? Math.max(...memberLevelUps.map((levelUp) => levelUp.to))
      : null;

    return Object.freeze({
      memberId,
      xp,
      reasons: Object.freeze(reasons),
      leveledUp: memberLevelUps.length > 0,
      fromLevel,
      toLevel,
    });
  });

  const totalXp = heroes.reduce((total, hero) => total + hero.xp, 0);
  return Object.freeze({
    totalXp,
    hasRewards: totalXp > 0 || heroes.some((hero) => hero.leveledUp),
    hasLevelUp: heroes.some((hero) => hero.leveledUp),
    heroes: Object.freeze(heroes),
  });
}

export function chroniclesProgressionFeedbackLabel(feedback, nameForMember = (memberId) => memberId) {
  if (!feedback?.hasRewards) return '';
  return feedback.heroes.map((hero) => {
    const name = String(nameForMember(hero.memberId) || hero.memberId);
    const xp = hero.xp > 0 ? `+${hero.xp} XP` : '';
    const level = hero.leveledUp ? `NIVEL ${hero.toLevel}` : '';
    return [name, xp, level].filter(Boolean).join(' · ');
  }).join(' · ');
}
