import { useEffect, useRef } from 'react';
import { createOperationId, operationFingerprint } from './operationId.js';
import { ACTIVE_SESSION_EVENT, ACTIVE_SESSION_STATE, activeSessionTransition } from './activeSessionMachine.js';
import { reportStateInvariant } from './stateMachine.js';

/**
 * Owns the complete lifecycle of a game-creation request.
 *
 * App should decide *what* game to create; this hook decides whether the
 * response still belongs to the current view, how retries reuse an idempotency
 * key, and how the launch state machine reaches a valid terminal state.
 */
export function useGameLaunchController(view, { onCancelled } = {}) {
  const launchRef = useRef(null); // { token, controller, originView, operationId? }
  const retryRef = useRef(null); // same operation after timeout/503, max 5 minutes
  const machineRef = useRef(ACTIVE_SESSION_STATE.IDLE);
  const viewRef = useRef(view);
  const onCancelledRef = useRef(onCancelled);
  viewRef.current = view;
  onCancelledRef.current = onCancelled;

  function begin() {
    if (launchRef.current) return null;
    const current = machineRef.current;
    const transition = activeSessionTransition(current, ACTIVE_SESSION_EVENT.CREATE);
    if (!transition.ok) {
      reportStateInvariant('game-launch', 'invalid-transition', { state: current, event: ACTIVE_SESSION_EVENT.CREATE, route: viewRef.current });
      return null;
    }
    machineRef.current = transition.nextState;
    const launch = { token: Symbol('game-launch'), controller: new AbortController(), originView: viewRef.current };
    launchRef.current = launch;
    return launch;
  }

  function isCurrent(launch) {
    return !!launch && launchRef.current === launch && !launch.controller.signal.aborted && viewRef.current === launch.originView;
  }

  function operationId(launch, parts) {
    if (!launch) return null;
    const fingerprint = operationFingerprint(parts);
    if (launch.operationId && launch.operationFingerprint === fingerprint) return launch.operationId;
    const retry = retryRef.current;
    const reusable = retry && retry.fingerprint === fingerprint && (Date.now() - retry.failedAt) < 5 * 60_000;
    const id = reusable ? retry.operationId : createOperationId('create');
    launch.operationId = id;
    launch.operationFingerprint = fingerprint;
    retryRef.current = { fingerprint, operationId: id, failedAt: Date.now() };
    return id;
  }

  function confirmCreated(launch) {
    if (launch?.operationId && retryRef.current?.operationId === launch.operationId) retryRef.current = null;
    const result = activeSessionTransition(machineRef.current, ACTIVE_SESSION_EVENT.CREATED);
    if (result.ok) machineRef.current = result.nextState;
    else reportStateInvariant('game-launch', 'invalid-created-transition', { state: machineRef.current, event: ACTIVE_SESSION_EVENT.CREATED, route: viewRef.current });
  }

  function end(launch, { cancelled = false } = {}) {
    if (launchRef.current === launch) launchRef.current = null;
    const current = machineRef.current;
    if (cancelled && [ACTIVE_SESSION_STATE.CREATING, ACTIVE_SESSION_STATE.ACTIVE].includes(current)) {
      const result = activeSessionTransition(current, ACTIVE_SESSION_EVENT.CANCEL_CREATE);
      if (result.ok) machineRef.current = result.nextState;
      else reportStateInvariant('game-launch', 'invalid-cancel-transition', { state: current, event: ACTIVE_SESSION_EVENT.CANCEL_CREATE, route: viewRef.current });
      return;
    }
    if (!cancelled && current === ACTIVE_SESSION_STATE.CREATING) {
      const result = activeSessionTransition(current, ACTIVE_SESSION_EVENT.CREATE_FAILURE);
      if (result.ok) machineRef.current = result.nextState;
      else reportStateInvariant('game-launch', 'invalid-failure-transition', { state: current, event: ACTIVE_SESSION_EVENT.CREATE_FAILURE, route: viewRef.current });
    }
  }

  function owns(launch) {
    return !!launch && launchRef.current === launch;
  }

  function busy() {
    return !!launchRef.current;
  }

  useEffect(() => {
    const launch = launchRef.current;
    if (!launch || launch.originView === view) return;
    launch.controller.abort(new DOMException('Game launch view changed', 'AbortError'));
    end(launch, { cancelled: true });
    onCancelledRef.current?.();
  }, [view]);

  useEffect(() => () => {
    const launch = launchRef.current;
    launch?.controller?.abort(new DOMException('App unmounted', 'AbortError'));
    if (launch) end(launch, { cancelled: true });
  }, []);

  return { begin, isCurrent, operationId, confirmCreated, end, owns, busy };
}
