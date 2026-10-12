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

  // Ordinary exploration locomotion is local runtime state. Strip the
  // continuously changing party pose and enemy-cadence counter so walking does
  // not become a stream of remote checkpoint writes. Enemy positions themselves
  // remain semantic: when a paced world activation moves a creature, that new
  // position changes the fingerprint and the payload also persists the cadence.
  return chroniclesRunCheckpointFingerprint({
    ...state,
    x: -1,
    y: -1,
    direction: -1,
    explorationEnemySteps: undefined,
  });
}
