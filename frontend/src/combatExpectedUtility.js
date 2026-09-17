// Combat-only decision policy.
//
// This module deliberately does not know how to search chess positions or how
// Combat resolves attacks. Callers must provide factual candidate measurements
// produced by those systems. The policy only re-ranks chess-plausible choices.
// Normal chess never imports this module.

export const DEFAULT_COMBAT_UTILITY_OPTIONS = Object.freeze({
  // Combat may choose among near-best chess moves, but it cannot buy a large
  // positional blunder with RPG value.
  maxChessLossCp: 80,
  missTempoCp: 18,
  bossDamageCp: 22,
  techniqueCp: 16,
  persistentUnitCp: 55,
  exposureCp: 35,
});

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function probability(value) {
  return Math.max(0, Math.min(1, finite(value, 0)));
}

export function combatCandidateUtility(candidate, options = {}) {
  if (!candidate || candidate.isLegal === false) return -Infinity;
  if (candidate.isMate === true) return Number.POSITIVE_INFINITY;

  const cfg = { ...DEFAULT_COMBAT_UTILITY_OPTIONS, ...options };
  const chessScoreCp = finite(candidate.chessScoreCp, 0);
  const hitChance = probability(candidate.hitChance);
  const enemyValue = Math.max(0, finite(candidate.enemyValue, 0));
  const ownPersistentValue = Math.max(0, finite(candidate.ownPersistentValue, 0));
  const ownCasualtyRisk = probability(candidate.ownCasualtyRisk);
  const exposureRisk = probability(candidate.exposureRisk);
  const expectedBossDamage = Math.max(0, finite(candidate.expectedBossDamage, 0));
  const techniqueValue = Math.max(0, finite(candidate.techniqueValue, 0));

  const captureCp = enemyValue > 0
    ? (hitChance * enemyValue * 100) - ((1 - hitChance) * finite(cfg.missTempoCp, 18))
    : 0;
  const bossCp = expectedBossDamage * finite(cfg.bossDamageCp, 22);
  const techniqueCp = techniqueValue * finite(cfg.techniqueCp, 16);
  const veteranRiskCp = ownPersistentValue * ownCasualtyRisk * finite(cfg.persistentUnitCp, 55);
  const exposureCp = exposureRisk * finite(cfg.exposureCp, 35);

  return chessScoreCp + captureCp + bossCp + techniqueCp - veteranRiskCp - exposureCp;
}

export function rankCombatCandidates(candidates, options = {}) {
  const legal = (Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => candidate && candidate.isLegal !== false);
  if (!legal.length) return [];

  const mates = legal.filter((candidate) => candidate.isMate === true);
  if (mates.length) {
    return [...mates].sort((a, b) => String(a.moveKey || '').localeCompare(String(b.moveKey || '')));
  }

  const cfg = { ...DEFAULT_COMBAT_UTILITY_OPTIONS, ...options };
  const bestChessScore = Math.max(...legal.map((candidate) => finite(candidate.chessScoreCp, -Infinity)));
  const maxChessLossCp = Math.max(0, finite(cfg.maxChessLossCp, 80));

  return legal
    .filter((candidate) => bestChessScore - finite(candidate.chessScoreCp, -Infinity) <= maxChessLossCp)
    .map((candidate) => ({
      ...candidate,
      combatUtility: combatCandidateUtility(candidate, cfg),
      chessLossCp: Math.max(0, bestChessScore - finite(candidate.chessScoreCp, bestChessScore)),
    }))
    .sort((a, b) => {
      const utilityDelta = b.combatUtility - a.combatUtility;
      if (Math.abs(utilityDelta) > 1e-9) return utilityDelta;
      const chessDelta = finite(b.chessScoreCp, 0) - finite(a.chessScoreCp, 0);
      if (Math.abs(chessDelta) > 1e-9) return chessDelta;
      return String(a.moveKey || '').localeCompare(String(b.moveKey || ''));
    });
}

export function chooseCombatCandidate(candidates, options = {}) {
  return rankCombatCandidates(candidates, options)[0] || null;
}
