import { replayFenPositions } from './chessRules.js';
import { buildCombatReplayPositions } from './combatReplay.js';

function eventsOf(value) {
  return Array.isArray(value) ? value : [];
}

export function buildStandardReplayTimeline(record = {}) {
  const events = eventsOf(record.moves);
  const replay = replayFenPositions(events, record.initialFen);
  return {
    frames: replay.positions,
    events,
    metadata: {
      kind: 'standard',
      initialFen: replay.positions[0],
      complete: replay.complete,
      failedAt: replay.failedAt,
      invalidInitial: replay.invalidInitial,
      invalidIndices: replay.failedAt === null ? [] : [replay.failedAt],
    },
  };
}

export function buildCombatReplayTimeline(record = {}) {
  const events = eventsOf(record.log);
  const replay = buildCombatReplayPositions(events);
  const invalidIndices = [...replay.invalidIndices];
  return {
    frames: replay.positions,
    events,
    metadata: {
      kind: 'combat',
      initialFen: replay.initialFen,
      complete: invalidIndices.length === 0,
      failedAt: invalidIndices[0] ?? null,
      invalidInitial: false,
      invalidIndices,
    },
  };
}
