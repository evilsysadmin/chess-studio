import { describe, expect, it, vi } from 'vitest';
import { createCombatAsyncCoordinator } from './combatAsyncCoordinator.js';

function fakeTimers() {
  let sequence = 0;
  const callbacks = new Map();
  return {
    callbacks,
    setTimer(callback) {
      sequence += 1;
      callbacks.set(sequence, callback);
      return sequence;
    },
    clearTimer(timer) {
      callbacks.delete(timer);
    },
    run(timer) {
      const callback = callbacks.get(timer);
      if (callback) callback();
    },
  };
}

describe('createCombatAsyncCoordinator', () => {
  it('ejecuta timers sólo dentro de la generación de batalla que los programó', () => {
    const timers = fakeTimers();
    const callback = vi.fn();
    const coordinator = createCombatAsyncCoordinator(timers);
    const timer = coordinator.schedule(callback, 250);

    coordinator.invalidate('New battle');
    timers.run(timer);

    expect(callback).not.toHaveBeenCalled();
    expect(timers.callbacks.size).toBe(0);
  });

  it('invalida la batalla, aborta el turno CPU y rechaza su respuesta tardía', () => {
    const coordinator = createCombatAsyncCoordinator();
    const operation = coordinator.beginCpuTurn();

    expect(coordinator.isCurrent(operation)).toBe(true);
    coordinator.invalidate('Combat retired');

    expect(operation.controller.signal.aborted).toBe(true);
    expect(operation.controller.signal.reason?.name).toBe('AbortError');
    expect(coordinator.isCurrent(operation)).toBe(false);
    expect(coordinator.isGenerationCurrent(operation)).toBe(false);
  });

  it('aborta un turno CPU anterior cuando uno nuevo lo sustituye sin cambiar de batalla', () => {
    const coordinator = createCombatAsyncCoordinator();
    const first = coordinator.beginCpuTurn();
    const second = coordinator.beginCpuTurn();

    expect(first.controller.signal.aborted).toBe(true);
    expect(coordinator.isCurrent(first)).toBe(false);
    expect(coordinator.isCurrent(second)).toBe(true);
    expect(coordinator.isGenerationCurrent(first)).toBe(true);
    expect(coordinator.finishCpuTurn(first)).toBe(false);
    expect(coordinator.finishCpuTurn(second)).toBe(true);
  });

  it('propaga errores diferidos sólo si la batalla que los originó sigue vigente', async () => {
    const timers = fakeTimers();
    const onDeferredError = vi.fn();
    const coordinator = createCombatAsyncCoordinator({ ...timers, onDeferredError });
    const error = new Error('boom');
    const timer = coordinator.schedule(() => Promise.reject(error), 100);

    timers.run(timer);
    await Promise.resolve();
    expect(onDeferredError).toHaveBeenCalledWith(error);

    const staleError = new Error('stale');
    const staleTimer = coordinator.schedule(() => Promise.reject(staleError), 100);
    timers.run(staleTimer);
    coordinator.invalidate('Battle changed');
    await Promise.resolve();
    expect(onDeferredError).not.toHaveBeenCalledWith(staleError);
  });

  it('dispose cancela timers y deja todos los callbacks futuros sin permiso para tocar estado', () => {
    const timers = fakeTimers();
    const callback = vi.fn();
    const coordinator = createCombatAsyncCoordinator(timers);
    const timer = coordinator.schedule(callback, 100);
    const operation = coordinator.beginCpuTurn();

    coordinator.dispose();
    timers.run(timer);

    expect(callback).not.toHaveBeenCalled();
    expect(operation.controller.signal.aborted).toBe(true);
    expect(coordinator.isCurrent(operation)).toBe(false);
    expect(timers.callbacks.size).toBe(0);
  });
});
