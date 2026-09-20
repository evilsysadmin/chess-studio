import { describe, expect, it } from 'vitest';
import { cpuRatingForDifficulty, difficultyForCpuRating } from './playerRating.js';
import {
  QUICK_MATCH_HYSTERESIS_ELO,
  QUICK_MATCH_TARGET_LEAD_ELO,
  difficultyForQuickMatchRating,
  provisionalQuickMatchLeadElo,
  quickMatchQualityAdjustment,
  quickMatchRecalibration,
} from './quickMatchDifficulty.js';

function adaptiveGame(gameId, outcome, difficulty = 56) {
  return [
    { gameId, state: 'finished', outcome, difficulty, mode: 'casual' },
    { gameId, state: 'started', detail: 'adaptive-difficulty', difficulty, mode: 'casual' },
  ];
}

describe('quick-match Elo chaser', () => {
  it('uses one invertible CPU strength relationship', () => {
    for (const difficulty of [0, 20, 45, 60, 70, 90, 100]) {
      const rating = cpuRatingForDifficulty(difficulty);
      expect(difficultyForCpuRating(rating)).toBe(difficulty);
    }
  });

  it('keeps established Matthias slightly above the player across the usable range', () => {
    for (const rating of [400, 600, 800, 1000, 1200, 1400, 1600, 1700, 1750]) {
      const difficulty = difficultyForQuickMatchRating(rating, [], 20);
      const lead = cpuRatingForDifficulty(difficulty) - rating;
      expect(lead).toBeGreaterThanOrEqual(25);
      expect(lead).toBeLessThanOrEqual(75);
    }
  });

  it('targets +50 Elo rather than the old underpowered high-rating mapping', () => {
    const difficulty = difficultyForQuickMatchRating(1600, [], 20);
    const lead = cpuRatingForDifficulty(difficulty) - 1600;
    expect(Math.abs(lead - QUICK_MATCH_TARGET_LEAD_ELO)).toBeLessThanOrEqual(15);
  });

  it('honra el alivio provisional incluso en el suelo de rating', () => {
    const difficulty = difficultyForQuickMatchRating(400, [], 0);
    expect(difficulty).toBe(0);
    expect(cpuRatingForDifficulty(difficulty)).toBe(350);
    expect(cpuRatingForDifficulty(difficulty) - 400).toBe(-50);
  });

  it('ramps provisional players from a gentle calibration toward the +50 target', () => {
    expect(provisionalQuickMatchLeadElo(0)).toBe(-50);
    expect(provisionalQuickMatchLeadElo(6)).toBe(0);
    expect(provisionalQuickMatchLeadElo(12)).toBe(50);

    const early = cpuRatingForDifficulty(difficultyForQuickMatchRating(800, [], 0));
    const midpoint = cpuRatingForDifficulty(difficultyForQuickMatchRating(800, [], 6));
    const established = cpuRatingForDifficulty(difficultyForQuickMatchRating(800, [], 12));
    expect(early).toBeLessThan(midpoint);
    expect(midpoint).toBeLessThan(established);
  });

  it('holds the previous adaptive rival while it remains inside the hysteresis band', () => {
    const activity = [
      { gameId: 'previous', state: 'started', detail: 'adaptive-difficulty', difficulty: 55, mode: 'casual' },
    ];
    const previousLead = cpuRatingForDifficulty(55) - 1000;
    expect(Math.abs(previousLead - QUICK_MATCH_TARGET_LEAD_ELO)).toBeLessThanOrEqual(QUICK_MATCH_HYSTERESIS_ELO);
    expect(difficultyForQuickMatchRating(1000, activity, 20)).toBe(55);
  });

  it('recalibrates when the previous opponent falls outside the Elo band', () => {
    const activity = [
      { gameId: 'too-easy', state: 'started', detail: 'adaptive-difficulty', difficulty: 45, mode: 'casual' },
    ];
    expect(difficultyForQuickMatchRating(1000, activity, 20)).not.toBe(45);
  });

  it('does not treat a clean early cancellation as evidence of playing strength', () => {
    const baseline = difficultyForQuickMatchRating(1000, [], 20);
    const activity = [
      { gameId: 'cancelled', state: 'cancelled', difficulty: baseline, mode: 'casual' },
      { gameId: 'cancelled', state: 'started', detail: 'adaptive-difficulty', difficulty: baseline, mode: 'casual' },
      { gameId: 'cancelled-2', state: 'cancelled', difficulty: baseline, mode: 'casual' },
      { gameId: 'cancelled-2', state: 'started', detail: 'adaptive-difficulty', difficulty: baseline, mode: 'casual' },
      { gameId: 'cancelled-3', state: 'cancelled', difficulty: baseline, mode: 'casual' },
      { gameId: 'cancelled-3', state: 'started', detail: 'adaptive-difficulty', difficulty: baseline, mode: 'casual' },
    ];

    expect(difficultyForQuickMatchRating(1000, activity, 20, {})).toBe(baseline);
  });

  it('reacts to a real adaptive losing streak only between games', () => {
    const baseline = difficultyForQuickMatchRating(1000, [], 20);
    const losses = [
      ...adaptiveGame('g3', 'loss', baseline),
      ...adaptiveGame('g2', 'loss', baseline),
      ...adaptiveGame('g1', 'loss', baseline),
    ];
    const relieved = difficultyForQuickMatchRating(1000, losses, 20);
    expect(relieved).toBeLessThan(baseline);
    expect(cpuRatingForDifficulty(relieved) - 1000).toBeLessThanOrEqual(25);
  });

  it('uses analyzed move quality only after two factual adaptive-game samples', () => {
    const activity = [
      ...adaptiveGame('g2', 'win', 56),
      ...adaptiveGame('g1', 'win', 56),
    ];
    const one = {
      g2: { sufficientSample: true, clean: false, averageLoss: 130, blunders: 2 },
    };
    const two = {
      ...one,
      g1: { sufficientSample: true, clean: false, averageLoss: 120, blunders: 2 },
    };

    expect(quickMatchQualityAdjustment(activity, 20, one)).toBe(0);
    expect(quickMatchQualityAdjustment(activity, 20, two)).toBe(-15);
  });

  it('lets repeated clean analyzed play add only a small quality boost', () => {
    const activity = [
      ...adaptiveGame('g3', 'draw', 56),
      ...adaptiveGame('g2', 'draw', 56),
      ...adaptiveGame('g1', 'draw', 56),
    ];
    const quality = Object.fromEntries(['g1', 'g2', 'g3'].map((gameId) => [
      gameId,
      { sufficientSample: true, clean: true, averageLoss: 18, blunders: 0 },
    ]));

    expect(quickMatchQualityAdjustment(activity, 20, quality)).toBe(10);
  });

  it('ignores analyzed evidence from non-adaptive games and provisional profiles', () => {
    const normalActivity = [
      { gameId: 'normal', state: 'finished', outcome: 'loss', difficulty: 56, mode: 'casual' },
      { gameId: 'normal', state: 'started', difficulty: 56, mode: 'casual' },
    ];
    const quality = {
      normal: { sufficientSample: true, clean: false, averageLoss: 180, blunders: 3 },
    };

    expect(quickMatchQualityAdjustment(normalActivity, 20, quality)).toBe(0);

    const adaptive = [
      ...adaptiveGame('g2', 'loss', 56),
      ...adaptiveGame('g1', 'loss', 56),
    ];
    expect(quickMatchQualityAdjustment(adaptive, 3, {
      g1: quality.normal,
      g2: quality.normal,
    })).toBe(0);
  });

  it('reports a factual post-game recalibration only when the opponent changes materially', () => {
    const changed = quickMatchRecalibration(
      45,
      1000,
      [{ gameId: 'old', state: 'started', detail: 'adaptive-difficulty', difficulty: 45, mode: 'casual' }],
      20,
    );
    expect(changed).toMatchObject({ difficulty: 56 });
    expect(changed.opponentRating - 1000).toBeGreaterThanOrEqual(25);

    const stable = quickMatchRecalibration(
      55,
      1000,
      [{ gameId: 'steady', state: 'started', detail: 'adaptive-difficulty', difficulty: 55, mode: 'casual' }],
      20,
    );
    expect(stable).toBeNull();
  });

  it('caps honestly at engine strength instead of inventing Elo above level 100', () => {
    expect(difficultyForQuickMatchRating(2200, [], 100)).toBe(100);
  });
});
