import { describe, expect, it } from 'vitest';
import { cpuRatingForDifficulty, difficultyForCpuRating } from './playerRating.js';
import {
  QUICK_MATCH_FORM_MAX_AGE_DAYS,
  QUICK_MATCH_HYSTERESIS_ELO,
  QUICK_MATCH_TARGET_LEAD_ELO,
  difficultyForQuickMatchRating,
  provisionalQuickMatchLeadElo,
  quickMatchEarlyCalibrationSignal,
  quickMatchQualityAdjustment,
  quickMatchRecalibration,
  quickMatchTargetLeadElo,
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

  it('ramps provisional players from a gentle calibration to the target in five games', () => {
    expect(provisionalQuickMatchLeadElo(0)).toBe(-50);
    expect(provisionalQuickMatchLeadElo(2)).toBe(-10);
    expect(provisionalQuickMatchLeadElo(5)).toBe(50);

    const early = cpuRatingForDifficulty(difficultyForQuickMatchRating(800, [], 0));
    const midpoint = cpuRatingForDifficulty(difficultyForQuickMatchRating(800, [], 2));
    const established = cpuRatingForDifficulty(difficultyForQuickMatchRating(800, [], 5));
    expect(early).toBeLessThan(midpoint);
    expect(midpoint).toBeLessThan(established);
  });

  it('converges early after three unequivocal adaptive results', () => {
    const wins = [
      ...adaptiveGame('w3', 'win', 45),
      ...adaptiveGame('w2', 'win', 35),
      ...adaptiveGame('w1', 'win', 25),
    ];
    const losses = [
      ...adaptiveGame('l3', 'loss', 45),
      ...adaptiveGame('l2', 'loss', 35),
      ...adaptiveGame('l1', 'loss', 25),
    ];

    expect(quickMatchEarlyCalibrationSignal(wins, 3)).toBe(1);
    expect(quickMatchEarlyCalibrationSignal(losses, 3)).toBe(-1);
    expect(quickMatchTargetLeadElo(wins, 3, {})).toBe(50);
    expect(quickMatchTargetLeadElo(losses, 3, {})).toBe(-75);
  });

  it('does not force early convergence on mixed provisional evidence', () => {
    const mixed = [
      ...adaptiveGame('m3', 'win', 45),
      ...adaptiveGame('m2', 'draw', 35),
      ...adaptiveGame('m1', 'loss', 25),
    ];
    expect(quickMatchEarlyCalibrationSignal(mixed, 3)).toBe(0);
    expect(quickMatchTargetLeadElo(mixed, 3, {})).toBe(10);
  });

  it('holds the previous adaptive rival while it remains inside the hysteresis band', () => {
    const previousDifficulty = difficultyForCpuRating(1000 + QUICK_MATCH_TARGET_LEAD_ELO);
    const activity = [
      { gameId: 'previous', state: 'started', detail: 'adaptive-difficulty', difficulty: previousDifficulty, mode: 'casual' },
    ];
    const previousLead = cpuRatingForDifficulty(previousDifficulty) - 1000;
    expect(Math.abs(previousLead - QUICK_MATCH_TARGET_LEAD_ELO)).toBeLessThanOrEqual(QUICK_MATCH_HYSTERESIS_ELO);
    expect(difficultyForQuickMatchRating(1000, activity, 20)).toBe(previousDifficulty);
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

  it('forgets stale form instead of punishing a player for a bad month long ago', () => {
    const now = Date.parse('2026-09-20T12:00:00Z');
    const staleDate = new Date(now - ((QUICK_MATCH_FORM_MAX_AGE_DAYS + 2) * 24 * 60 * 60 * 1000)).toISOString();
    const baseline = difficultyForQuickMatchRating(1000, [], 20, {}, now);
    const staleLosses = ['g3', 'g2', 'g1'].flatMap((gameId) => [
      { gameId, state: 'finished', outcome: 'loss', difficulty: baseline, mode: 'casual', date: staleDate },
      { gameId, state: 'started', detail: 'adaptive-difficulty', difficulty: baseline, mode: 'casual', date: staleDate },
    ]);

    expect(difficultyForQuickMatchRating(1000, staleLosses, 20, {}, now)).toBe(baseline);
  });

  it('does not let an old adaptive opponent pin hysteresis after a long break', () => {
    const now = Date.parse('2026-09-20T12:00:00Z');
    const staleDate = new Date(now - ((QUICK_MATCH_FORM_MAX_AGE_DAYS + 2) * 24 * 60 * 60 * 1000)).toISOString();
    const oldDifficulty = 55;
    const activity = [
      { gameId: 'old', state: 'started', detail: 'adaptive-difficulty', difficulty: oldDifficulty, mode: 'casual', date: staleDate },
    ];

    const selected = difficultyForQuickMatchRating(1200, activity, 20, {}, now);
    expect(selected).not.toBe(oldDifficulty);
  });

  it('ignores noisy established form sampled against only one opponent strength', () => {
    const baseline = difficultyForQuickMatchRating(1000, [], 20);
    const repeated = [
      ...adaptiveGame('same3', 'win', baseline),
      ...adaptiveGame('same2', 'draw', baseline),
      ...adaptiveGame('same1', 'loss', baseline),
    ];

    expect(quickMatchTargetLeadElo(repeated, 20, {})).toBe(QUICK_MATCH_TARGET_LEAD_ELO);
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

  it('does not use the maximum upward form boost without a sustained win streak', () => {
    const mixedHotForm = [
      ...adaptiveGame('hot1', 'win', 55),
      ...adaptiveGame('hot2', 'draw', 54),
      ...adaptiveGame('hot3', 'win', 53),
      ...adaptiveGame('hot4', 'win', 52),
    ];

    expect(quickMatchTargetLeadElo(mixedHotForm, 20, {})).toBeLessThanOrEqual(60);
  });

  it('lets a real recovery win stop maximum losing-streak relief', () => {
    const baseline = difficultyForQuickMatchRating(1000, [], 20);
    const recovery = [
      ...adaptiveGame('recovery', 'win', baseline),
      ...adaptiveGame('loss4', 'loss', baseline - 1),
      ...adaptiveGame('loss3', 'loss', baseline - 2),
      ...adaptiveGame('loss2', 'loss', baseline - 3),
      ...adaptiveGame('loss1', 'loss', baseline - 4),
    ];

    expect(quickMatchTargetLeadElo(recovery, 20, {})).toBeGreaterThanOrEqual(30);
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
    const targetDifficulty = difficultyForCpuRating(1000 + QUICK_MATCH_TARGET_LEAD_ELO);
    const changed = quickMatchRecalibration(
      45,
      1000,
      [{ gameId: 'old', state: 'started', detail: 'adaptive-difficulty', difficulty: 45, mode: 'casual' }],
      20,
    );
    expect(changed).toMatchObject({ difficulty: targetDifficulty });
    expect(changed.opponentRating - 1000).toBeGreaterThanOrEqual(25);

    const stable = quickMatchRecalibration(
      targetDifficulty,
      1000,
      [{ gameId: 'steady', state: 'started', detail: 'adaptive-difficulty', difficulty: targetDifficulty, mode: 'casual' }],
      20,
    );
    expect(stable).toBeNull();
  });

  it('caps honestly at engine strength instead of inventing Elo above level 100', () => {
    expect(difficultyForQuickMatchRating(2200, [], 100)).toBe(100);
  });
});
