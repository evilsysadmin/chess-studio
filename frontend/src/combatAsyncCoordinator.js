import { isAbortError } from './asyncControl.js';

function abortError(reason) {
  return new DOMException(reason, 'AbortError');
}

export function createCombatAsyncCoordinator({
  setTimer = (callback, delay) => window.setTimeout(callback, delay),
  clearTimer = (timer) => window.clearTimeout(timer),
  onDeferredError = () => {},
} = {}) {
  let mounted = true;
  let generation = 0;
  let cpuController = null;
  const scheduledTimers = new Set();

  function isGenerationCurrent(operationOrGeneration) {
    const expected = typeof operationOrGeneration === 'number'
      ? operationOrGeneration
      : operationOrGeneration?.generation;
    return mounted && generation === expected;
  }

  function schedule(callback, delay) {
    const scheduledGeneration = generation;
    let timer = null;
    timer = setTimer(() => {
      scheduledTimers.delete(timer);
      if (!isGenerationCurrent(scheduledGeneration)) return;
      try {
        const pending = callback();
        if (pending && typeof pending.catch === 'function') {
          pending.catch((error) => {
            if (!isGenerationCurrent(scheduledGeneration) || isAbortError(error)) return;
            onDeferredError(error);
          });
        }
      } catch (error) {
        if (!isGenerationCurrent(scheduledGeneration)) return;
        onDeferredError(error);
      }
    }, delay);
    scheduledTimers.add(timer);
    return timer;
  }

  function cancelScheduled() {
    for (const timer of scheduledTimers) clearTimer(timer);
    scheduledTimers.clear();
  }

  function beginCpuTurn() {
    const controller = new AbortController();
    cpuController?.abort(abortError('Superseded Combat CPU turn'));
    cpuController = controller;
    return { controller, generation };
  }

  function isCurrent(operation) {
    return !!operation
      && isGenerationCurrent(operation)
      && !operation.controller.signal.aborted;
  }

  function finishCpuTurn(operation) {
    if (!operation || cpuController !== operation.controller) return false;
    cpuController = null;
    return true;
  }

  function invalidate(reason = 'Combat state changed') {
    generation += 1;
    cpuController?.abort(abortError(reason));
    cpuController = null;
    cancelScheduled();
    return generation;
  }

  function dispose(reason = 'Combat unmounted') {
    mounted = false;
    invalidate(reason);
  }

  return {
    schedule,
    beginCpuTurn,
    isCurrent,
    isGenerationCurrent,
    finishCpuTurn,
    invalidate,
    dispose,
  };
}
