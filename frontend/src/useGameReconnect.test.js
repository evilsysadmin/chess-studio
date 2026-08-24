import { describe, expect, it } from 'vitest';
import { SAVE_STATUS } from './saveStatus.js';
import {
  reconnectStillNeeded,
  sameReconnectTarget,
  shouldAttemptReconnect,
} from './useGameReconnect.js';

describe('reconexión de partida · política defensiva', () => {
  it('nunca lanza dos reconciliaciones simultáneas', () => {
    expect(shouldAttemptReconnect({ inFlight: true, reconnectNeeded: true, saveState: SAVE_STATUS.ERROR })).toBe(false);
    expect(shouldAttemptReconnect({ inFlight: false, reconnectNeeded: true, saveState: SAVE_STATUS.SAVED })).toBe(true);
  });

  it('un estado ERROR fuerza intento aunque no se haya observado offline explícito', () => {
    expect(shouldAttemptReconnect({ inFlight: false, reconnectNeeded: false, saveState: SAVE_STATUS.ERROR })).toBe(true);
    expect(shouldAttemptReconnect({ inFlight: false, reconnectNeeded: false, saveState: SAVE_STATUS.SAVED })).toBe(false);
  });

  it('una respuesta tardía no puede aplicarse si el usuario cambió de partida o de modo', () => {
    const expected = { route: 'game', gameId: 'g-1' };
    expect(sameReconnectTarget(expected, { route: 'game', gameId: 'g-1' })).toBe(true);
    expect(sameReconnectTarget(expected, { route: 'game', gameId: 'g-2' })).toBe(false);
    expect(sameReconnectTarget(expected, { route: 'tournamentGame', gameId: 'g-1' })).toBe(false);
    expect(sameReconnectTarget(expected, null)).toBe(false);
  });

  it('si vuelve a caer la red durante el request, queda otra reconciliación pendiente', () => {
    expect(reconnectStillNeeded({ generationAtStart: 4, currentGeneration: 5, online: true })).toBe(true);
    expect(reconnectStillNeeded({ generationAtStart: 4, currentGeneration: 4, online: false })).toBe(true);
    expect(reconnectStillNeeded({ generationAtStart: 4, currentGeneration: 4, online: true })).toBe(false);
  });
});
