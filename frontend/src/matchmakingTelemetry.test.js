import { beforeEach, describe, expect, it } from 'vitest';
import {
  MATCHMAKING_TELEMETRY_KEY,
  loadMatchmakingTelemetry,
  matchmakingTelemetrySample,
  recordCompletedAdaptiveMatchmakingTelemetry,
  recordMatchmakingTelemetry,
} from './matchmakingTelemetry.js';

beforeEach(() => localStorage.clear());

describe('matchmaking profile telemetry', () => {
  it('records only adaptive games and factual outcome signals', () => {
    expect(recordMatchmakingTelemetry({ gameId: 'manual', adaptiveDifficulty: false })).toBeNull();
    const sample = recordMatchmakingTelemetry({
      gameId: 'g1',
      adaptiveDifficulty: true,
      outcome: 'draw',
      difficulty: 45,
      closeGame: true,
      stalemateFromWinning: true,
    });
    expect(sample).toMatchObject({ gameId: 'g1', closeGame: true, stalemateFromWinning: true });
    expect(loadMatchmakingTelemetry().samples).toHaveLength(1);
  });

  it('is idempotent per game and bounds profile growth', () => {
    recordMatchmakingTelemetry({ gameId: 'same', adaptiveDifficulty: true, outcome: 'loss' });
    recordMatchmakingTelemetry({ gameId: 'same', adaptiveDifficulty: true, outcome: 'win', rematch: true });
    for (let i = 0; i < 90; i += 1) {
      recordMatchmakingTelemetry({ gameId: `g${i}`, adaptiveDifficulty: true, outcome: 'draw' });
    }
    const state = loadMatchmakingTelemetry();
    expect(state.samples).toHaveLength(80);
    expect(state.samples.filter((row) => row.gameId === 'same')).toHaveLength(0);
  });

  it('uses the versioned profile key consumed by admin aggregation', () => {
    recordMatchmakingTelemetry({ gameId: 'g1', adaptiveDifficulty: true, outcome: 'win' });
    expect(localStorage.getItem(MATCHMAKING_TELEMETRY_KEY)).toContain('"version":1');
  });

  it('maps completed adaptive context without collecting move-level detail', () => {
    const sample = recordCompletedAdaptiveMatchmakingTelemetry({
      gameContext: { adaptiveDifficulty: true, rematch: true },
      finishedGame: { id: 'g-map', difficulty: 60 },
      outcome: 'win',
      endMeta: { closeGame: true, decisiveAdvantageEscaped: true },
    });
    expect(sample).toMatchObject({
      gameId: 'g-map',
      outcome: 'win',
      difficulty: 60,
      closeGame: true,
      decisiveAdvantageEscaped: true,
      rematch: true,
    });
  });

  it('normalizes malformed difficulty instead of inventing a measurement', () => {
    expect(matchmakingTelemetrySample({
      gameId: 'g1',
      adaptiveDifficulty: true,
      difficulty: 'wat',
    })).toMatchObject({ difficulty: null });
  });
});
