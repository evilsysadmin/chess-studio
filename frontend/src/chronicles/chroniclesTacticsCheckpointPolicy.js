import { chroniclesRunCheckpointFingerprint } from './chroniclesRunCheckpoint.js';

function freeExploration(state) {
  return Boolean(
    state
    && state.phase === 'explore'
    && !state.initiative?.order?.length
  );
}

export function chroniclesTacticsCheckpointFingerprint(state) {
  if (!freeExploration(state)) return chroniclesRunCheckpointFingerprint(state);

  // Ordinary exploration locomotion is local runtime state. Strip only the
  // continuously changing position/orientation fields from the fingerprint so
  // walking never becomes a stream of remote checkpoint writes. Any semantic
  // change (content flags, inventory, quests, HP, enemy state, map, phase, etc.)
  // still changes the fingerprint; the payload then persists the latest x/y.
  return chroniclesRunCheckpointFingerprint({
    ...state,
    x: -1,
    y: -1,
    direction: -1,
  });
}
