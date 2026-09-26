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

function bool(value) {
  return value === true;
}

export function matchmakingTelemetrySample(input = {}) {
  if (!input.gameId || input.adaptiveDifficulty !== true) return null;
  const difficulty = Number(input.difficulty);
  const playerRating = Number(input.playerRating);
  const opponentRating = Number(input.opponentRating);
  return {
    gameId: String(input.gameId),
    date: input.date || new Date().toISOString(),
    outcome: ['win', 'draw', 'loss'].includes(input.outcome) ? input.outcome : null,
    difficulty: Number.isFinite(difficulty) ? difficulty : null,
    playerRating: Number.isFinite(playerRating) ? playerRating : null,
    opponentRating: Number.isFinite(opponentRating) ? opponentRating : null,
    closeGame: bool(input.closeGame),
    decisiveAdvantageEscaped: bool(input.decisiveAdvantageEscaped),
    stalemateFromWinning: bool(input.stalemateFromWinning),
    rematch: bool(input.rematch),
  };
}

export function recordMatchmakingTelemetry(input = {}) {
  const sample = matchmakingTelemetrySample(input);
  if (!sample) return null;
  const state = safeState();
  const samples = state.samples.filter((row) => row?.gameId !== sample.gameId);
  samples.push(sample);
  const next = { version: MATCHMAKING_TELEMETRY_VERSION, samples: samples.slice(-MAX_MATCHMAKING_SAMPLES) };
  // profileStorage es cache local + journal dirty; el sincronizador existente
  // persiste esta clave en Mongo mediante PATCH /api/profile.
  setProfileStorageItem(MATCHMAKING_TELEMETRY_KEY, JSON.stringify(next));
  return sample;
}

export function loadMatchmakingTelemetry() {
  return safeState();
}

export function matchmakingTelemetrySummary(state = safeState()) {
  const samples = Array.isArray(state?.samples) ? state.samples : [];
  const count = samples.length;
  const countWhere = (key) => samples.filter((row) => row?.[key] === true).length;
  const outcomes = { win: 0, draw: 0, loss: 0 };
  for (const row of samples) if (row?.outcome in outcomes) outcomes[row.outcome] += 1;
  return {
    count,
    outcomes,
    closeGames: countWhere('closeGame'),
    escapedWins: countWhere('decisiveAdvantageEscaped'),
    winningStalemates: countWhere('stalemateFromWinning'),
    rematches: countWhere('rematch'),
    closeGameRate: count ? countWhere('closeGame') / count : null,
    rematchRate: count ? countWhere('rematch') / count : null,
  };
}


export function recordCompletedAdaptiveMatchmakingTelemetry({
  gameContext = {},
  finishedGame,
  outcome,
  endMeta = {},
  ratingBefore,
  opponentRating,
} = {}) {
  return recordMatchmakingTelemetry({
    gameId: finishedGame?.id,
    adaptiveDifficulty: gameContext?.adaptiveDifficulty === true,
    outcome,
    difficulty: finishedGame?.difficulty,
    playerRating: ratingBefore,
    opponentRating,
    closeGame: endMeta?.closeGame === true,
    decisiveAdvantageEscaped: endMeta?.decisiveAdvantageEscaped === true,
    stalemateFromWinning: endMeta?.stalemateFromWinning === true,
    rematch: gameContext?.rematch === true,
  });
}
