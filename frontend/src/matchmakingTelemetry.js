import { STORAGE_LOCAL, readJsonStorage } from './safeStorage.js';
import { setProfileStorageItem } from './profileKeys.js';

export const MATCHMAKING_TELEMETRY_KEY = 'chess-study-matchmaking-telemetry-v1';
export const MATCHMAKING_TELEMETRY_VERSION = 1;
const MAX_MATCHMAKING_SAMPLES = 80;

function safeState() {
  const parsed = readJsonStorage(STORAGE_LOCAL, MATCHMAKING_TELEMETRY_KEY, { fallback: null });
  if (!parsed || parsed.version !== MATCHMAKING_TELEMETRY_VERSION || !Array.isArray(parsed.samples)) {
    return { version: MATCHMAKING_TELEMETRY_VERSION, samples: [] };
  }
  return {
    version: MATCHMAKING_TELEMETRY_VERSION,
    samples: parsed.samples.slice(-MAX_MATCHMAKING_SAMPLES),
  };
}

export function matchmakingTelemetrySample(input = {}) {
  if (!input.gameId || input.adaptiveDifficulty !== true) return null;
  const difficulty = Number(input.difficulty);
  return {
    gameId: String(input.gameId),
    date: input.date || new Date().toISOString(),
    outcome: ['win', 'draw', 'loss'].includes(input.outcome) ? input.outcome : null,
    difficulty: Number.isFinite(difficulty) ? difficulty : null,
    closeGame: input.closeGame === true,
    decisiveAdvantageEscaped: input.decisiveAdvantageEscaped === true,
    stalemateFromWinning: input.stalemateFromWinning === true,
    rematch: input.rematch === true,
  };
}

export function recordMatchmakingTelemetry(input = {}) {
  const sample = matchmakingTelemetrySample(input);
  if (!sample) return null;
  const state = safeState();
  const samples = state.samples.filter((row) => row?.gameId !== sample.gameId);
  samples.push(sample);
  const next = { version: MATCHMAKING_TELEMETRY_VERSION, samples: samples.slice(-MAX_MATCHMAKING_SAMPLES) };
  setProfileStorageItem(MATCHMAKING_TELEMETRY_KEY, JSON.stringify(next));
  return sample;
}

export function loadMatchmakingTelemetry() {
  return safeState();
}

export function recordCompletedAdaptiveMatchmakingTelemetry({
  gameContext = {},
  finishedGame,
  outcome,
  endMeta = {},
} = {}) {
  return recordMatchmakingTelemetry({
    gameId: finishedGame?.id,
    adaptiveDifficulty: gameContext?.adaptiveDifficulty === true,
    outcome,
    difficulty: finishedGame?.difficulty,
    closeGame: endMeta?.closeGame === true,
    decisiveAdvantageEscaped: endMeta?.decisiveAdvantageEscaped === true,
    stalemateFromWinning: endMeta?.stalemateFromWinning === true,
    rematch: gameContext?.rematch === true,
  });
}
