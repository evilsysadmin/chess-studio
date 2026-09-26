import { beforeEach, describe, expect, it } from 'vitest';
import {
  MATCHMAKING_TELEMETRY_KEY,
  loadMatchmakingTelemetry,
  matchmakingTelemetrySample,
  matchmakingTelemetrySummary,
  recordMatchmakingTelemetry,
  recordCompletedAdaptiveMatchmakingTelemetry,
} from './matchmakingTelemetry.js';

beforeEach(() => localStorage.clear());

describe('matchmaking profile telemetry', () => {
  it('records only adaptive games and keeps factual UX signals', () => {
    expect(recordMatchmakingTelemetry({ gameId: 'manual', adaptiveDifficulty: false })).toBeNull();
    const sample = recordMatchmakingTelemetry({
      gameId: 'g1',
      adaptiveDifficulty: true,
      outcome: 'draw',
      difficulty: 45,
      playerRating: 900,
      opponentRating: 950,
      closeGame: true,
      decisiveAdvantageEscaped: true,
      stalemateFromWinning: true,
    });
    expect(sample).toMatchObject({ gameId: 'g1', closeGame: true, decisiveAdvantageEscaped: true, stalemateFromWinning: true });
    expect(loadMatchmakingTelemetry().samples).toHaveLength(1);
  });

  it('is idempotent per game and bounds profile growth', () => {
    recordMatchmakingTelemetry({ gameId: 'same', adaptiveDifficulty: true, outcome: 'loss' });
    recordMatchmakingTelemetry({ gameId: 'same', adaptiveDifficulty: true, outcome: 'win', rematch: true });
    for (let i = 0; i < 90; i += 1) recordMatchmakingTelemetry({ gameId: 'g' + i, adaptiveDifficulty: true, outcome: 'draw' });
    const state = loadMatchmakingTelemetry();
    expect(state.samples).toHaveLength(80);
    expect(state.samples.filter((row) => row.gameId === 'same')).toHaveLength(0);
  });

  it('summarizes the signals later PRs need to tune matchmaking', () => {
    const summary = matchmakingTelemetrySummary({ samples: [
      { outcome: 'win', closeGame: true, rematch: true },
      { outcome: 'draw', closeGame: true, decisiveAdvantageEscaped: true, stalemateFromWinning: true },
      { outcome: 'loss' },
    ] });
    expect(summary).toMatchObject({
      count: 3,
      outcomes: { win: 1, draw: 1, loss: 1 },
      closeGames: 2,
      escapedWins: 1,
      winningStalemates: 1,
      rematches: 1,
    });
    expect(summary.closeGameRate).toBeCloseTo(2 / 3);
  });

  it('uses a versioned profile-storage key so existing Mongo sync persists it', () => {
    recordMatchmakingTelemetry({ gameId: 'g1', adaptiveDifficulty: true, outcome: 'win' });
    expect(localStorage.getItem(MATCHMAKING_TELEMETRY_KEY)).toContain('"version":1');
  });

  it('normalizes malformed numeric fields instead of inventing measurements', () => {
    expect(matchmakingTelemetrySample({ gameId: 'g1', adaptiveDifficulty: true, difficulty: 'wat' })).toMatchObject({
      difficulty: null,
      playerRating: null,
      opponentRating: null,
    });
  });
});


it('maps a completed adaptive game without making App own telemetry semantics', () => {
  const sample = recordCompletedAdaptiveMatchmakingTelemetry({
    gameContext: { adaptiveDifficulty: true, rematch: true },
    finishedGame: { id: 'g-map', difficulty: 60 },
    outcome: 'win',
    endMeta: { closeGame: true },
    ratingBefore: 1100,
    opponentRating: 1150,
  });
  expect(sample).toMatchObject({ gameId: 'g-map', outcome: 'win', closeGame: true, rematch: true, playerRating: 1100, opponentRating: 1150 });
});
