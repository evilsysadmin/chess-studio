import { strictInvariant, transition } from './stateTransition.js';

export const ACTIVE_SESSION_STATE = Object.freeze({
  IDLE: 'idle',
  CREATING: 'creating',
  RESTORING: 'restoring',
  ACTIVE: 'active',
  RECONNECTING: 'reconnecting',
  RETRYABLE_ERROR: 'retryable_error',
  IRRECOVERABLE: 'irrecoverable',
  DISCARDED: 'discarded',
  FINISHED: 'finished',
});

export const ACTIVE_SESSION_EVENT = Object.freeze({
  CREATE: 'create',
  CREATED: 'created',
  CREATE_FAILURE: 'create_failure',
  CANCEL_CREATE: 'cancel_create',
  RESTORE: 'restore',
  RESTORED: 'restored',
  RECONNECT: 'reconnect',
  RECONNECTED: 'reconnected',
  TRANSIENT_FAILURE: 'transient_failure',
  IRRECOVERABLE_FAILURE: 'irrecoverable_failure',
  STALE: 'stale',
  DISCARD: 'discard',
  FINISH: 'finish',
});

const T = Object.freeze({
  idle: { create: 'creating', restore: 'restoring', discard: 'discarded' },
  creating: { created: 'active', create_failure: 'idle', cancel_create: 'idle', discard: 'discarded' },
  restoring: { restored: 'active', transient_failure: 'retryable_error', irrecoverable_failure: 'irrecoverable', stale: 'idle', discard: 'discarded' },
  active: { create: 'creating', cancel_create: 'idle', restore: 'restoring', reconnect: 'reconnecting', transient_failure: 'retryable_error', finish: 'finished', discard: 'discarded' },
  reconnecting: { reconnected: 'active', transient_failure: 'retryable_error', stale: 'idle', discard: 'discarded' },
  retryable_error: { restore: 'restoring', reconnect: 'reconnecting', stale: 'idle', irrecoverable_failure: 'irrecoverable', discard: 'discarded' },
  irrecoverable: { discard: 'discarded', stale: 'idle' },
  discarded: { create: 'creating', restore: 'restoring' },
  finished: { create: 'creating', discard: 'discarded' },
});

export function activeSessionTransition(state, event) {
  return transition(T, state, event);
}

export function assertActiveSessionInvariant({ state, savedSession = null, route = null, gameId = null } = {}) {
  strictInvariant(Object.values(ACTIVE_SESSION_STATE).includes(state), `unknown active-session state ${state}`);
  if ([ACTIVE_SESSION_STATE.RESTORING, ACTIVE_SESSION_STATE.ACTIVE, ACTIVE_SESSION_STATE.RECONNECTING, ACTIVE_SESSION_STATE.RETRYABLE_ERROR].includes(state)) {
    strictInvariant(Boolean(gameId || savedSession?.gameId), `${state} requires a game id`);
  }
  if (savedSession?.route) {
    strictInvariant(['game', 'tournamentGame'].includes(savedSession.route), `unsupported route ${savedSession.route}`);
  }
  if (route && ['game', 'tournamentGame'].includes(route) && state === ACTIVE_SESSION_STATE.DISCARDED) {
    strictInvariant(false, 'discarded session cannot remain on an active game route');
  }
  return true;
}
