import { describe, expect, it, vi } from 'vitest';
import { createGameMutationCoordinator } from './gameMutationCoordinator.js';

describe('createGameMutationCoordinator', () => {
  it('permite una sola mutación activa y libera ownership sólo al terminar la operación dueña', () => {
    const coordinator = createGameMutationCoordinator();
    const first = coordinator.begin('move');

    expect(first).toBeTruthy();
    expect(coordinator.hasCurrent()).toBe(true);
    expect(coordinator.begin('undo')).toBeNull();
    expect(coordinator.isCurrent(first)).toBe(true);
    expect(coordinator.finish({})).toBe(false);
    expect(coordinator.hasCurrent()).toBe(true);
    expect(coordinator.finish(first)).toBe(true);
    expect(coordinator.hasCurrent()).toBe(false);
  });

  it('invalida la sesión, aborta la operación en vuelo y rechaza respuestas tardías', () => {
    const coordinator = createGameMutationCoordinator();
    const operation = coordinator.begin('move');
    const abortSpy = vi.fn();
    operation.controller.signal.addEventListener('abort', abortSpy);

    coordinator.invalidateSession('Game changed');

    expect(abortSpy).toHaveBeenCalledOnce();
    expect(operation.controller.signal.aborted).toBe(true);
    expect(operation.controller.signal.reason?.name).toBe('AbortError');
    expect(coordinator.isCurrent(operation)).toBe(false);
    expect(coordinator.hasCurrent()).toBe(false);
  });

  it('reutiliza el Idempotency-Key para el mismo fingerprint dentro de la ventana y lo retira al confirmar', () => {
    let now = 1_000;
    let sequence = 0;
    const coordinator = createGameMutationCoordinator({
      now: () => now,
      createId: (kind) => `${kind}-${++sequence}`,
      retryWindowMs: 5_000,
    });

    const first = coordinator.operationId('move', ['g1', 'e2', 'e4', 'q']);
    now += 2_000;
    const retry = coordinator.operationId('move', ['g1', 'e2', 'e4', 'q']);
    expect(retry).toBe(first);

    expect(coordinator.confirm(first)).toBe(true);
    const afterConfirm = coordinator.operationId('move', ['g1', 'e2', 'e4', 'q']);
    expect(afterConfirm).not.toBe(first);
  });

  it('genera un Idempotency-Key nuevo al expirar la ventana o cambiar el fingerprint', () => {
    let now = 10_000;
    let sequence = 0;
    const coordinator = createGameMutationCoordinator({
      now: () => now,
      createId: (kind) => `${kind}-${++sequence}`,
      retryWindowMs: 1_000,
    });

    const first = coordinator.operationId('move', ['g1', 'e2', 'e4', 'q']);
    const differentMove = coordinator.operationId('move', ['g1', 'd2', 'd4', 'q']);
    expect(differentMove).not.toBe(first);

    now += 1_500;
    const expired = coordinator.operationId('move', ['g1', 'd2', 'd4', 'q']);
    expect(expired).not.toBe(differentMove);
  });

  it('puede invalidar una sesión sin perder el retry idempotente pendiente', () => {
    let sequence = 0;
    const coordinator = createGameMutationCoordinator({ createId: (kind) => `${kind}-${++sequence}` });
    const first = coordinator.operationId('move', ['g1', 'e2', 'e4', 'q']);
    coordinator.begin('move');

    coordinator.invalidateSession('Clock flag fell', { clearRetry: false });

    expect(coordinator.operationId('move', ['g1', 'e2', 'e4', 'q'])).toBe(first);
    expect(coordinator.hasCurrent()).toBe(false);
  });
});
