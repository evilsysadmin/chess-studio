import { createOperationId, operationFingerprint } from './operationId.js';

const DEFAULT_RETRY_WINDOW_MS = 5 * 60_000;

function abortError(reason) {
  return new DOMException(reason, 'AbortError');
}

export function createGameMutationCoordinator({
  now = () => Date.now(),
  createId = createOperationId,
  retryWindowMs = DEFAULT_RETRY_WINDOW_MS,
} = {}) {
  let sessionGeneration = 0;
  let currentOperation = null;
  let retryOperation = null;

  function begin(kind = 'game-mutation') {
    if (currentOperation) return null;
    const controller = new AbortController();
    const operation = {
      kind,
      token: Symbol(kind),
      controller,
      session: sessionGeneration,
      operationId: null,
    };
    currentOperation = operation;
    return operation;
  }

  function hasCurrent() {
    return currentOperation !== null;
  }

  function isCurrent(operation) {
    return currentOperation === operation && operation?.session === sessionGeneration;
  }

  function finish(operation) {
    if (currentOperation !== operation) return false;
    currentOperation = null;
    return true;
  }

  function abortCurrent(reason = 'Mutation cancelled') {
    if (!currentOperation) return false;
    currentOperation.controller.abort(abortError(reason));
    currentOperation = null;
    return true;
  }

  function invalidateSession(reason, { clearRetry = true } = {}) {
    sessionGeneration += 1;
    abortCurrent(reason);
    if (clearRetry) retryOperation = null;
    return sessionGeneration;
  }

  function operationId(kind, parts) {
    const fingerprint = operationFingerprint([kind, ...parts]);
    const retry = retryOperation;
    if (
      retry
      && retry.fingerprint === fingerprint
      && (now() - retry.failedAt) < retryWindowMs
    ) {
      return retry.operationId;
    }
    const nextOperationId = createId(kind);
    retryOperation = {
      fingerprint,
      operationId: nextOperationId,
      failedAt: now(),
    };
    return nextOperationId;
  }

  function confirm(operationIdToConfirm) {
    if (operationIdToConfirm && retryOperation?.operationId === operationIdToConfirm) {
      retryOperation = null;
      return true;
    }
    return false;
  }

  return {
    begin,
    hasCurrent,
    isCurrent,
    finish,
    abortCurrent,
    invalidateSession,
    operationId,
    confirm,
  };
}
