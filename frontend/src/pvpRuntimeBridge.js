import { useSyncExternalStore } from 'react';

const EMPTY_PVP_RUNTIME = Object.freeze({
  enrolled: false,
  rivalCount: 0,
  incomingCount: 0,
  activeMatch: null,
  lobby: null,
  enterMatch: null,
  refresh: null,
  challenge: null,
  acceptChallenge: null,
  declineChallenge: null,
  enroll: null,
  leave: null,
});

let snapshot = EMPTY_PVP_RUNTIME;
const listeners = new Set();

function emit() {
  for (const listener of listeners) listener();
}

export function publishPvpRuntime(next) {
  snapshot = { ...EMPTY_PVP_RUNTIME, ...(next || {}) };
  emit();
}

export function clearPvpRuntime() {
  snapshot = EMPTY_PVP_RUNTIME;
  emit();
}

export function usePvpRuntime() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
    () => EMPTY_PVP_RUNTIME,
  );
}
