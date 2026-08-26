import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStorageMemoryFallback } from './safeStorage.js';
import { clearCombatSession, hasCombatSession, loadCombatSession, saveCombatSession } from './combatSession.js';

describe('Combat Chess active session snapshot', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearStorageMemoryFallback();
    clearCombatSession();
  });

  it('restaura sólo la batalla cuyo id coincide', () => {
    expect(saveCombatSession('campaign:abc:n1', { phase: 'battle', fen: 'fen-demo', registry: { e4: { type: 'p' } }, humanColor: 'w' })).toBe(true);
    expect(hasCombatSession('campaign:abc:n1')).toBe(true);
    expect(loadCombatSession('campaign:abc:n1')?.humanColor).toBe('w');
    expect(loadCombatSession('campaign:abc:n2')).toBeNull();
  });

  it('usa el respaldo local si sessionStorage no puede guardar', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const setItem = vi.spyOn(sessionStorage, 'setItem').mockImplementation(() => { throw new Error('quota'); });

    expect(saveCombatSession('free', { phase: 'battle', fen: 'fen-demo', registry: { e4: { type: 'p' } } })).toBe(true);
    expect(loadCombatSession('free')?.fen).toBe('fen-demo');
    expect(consoleError).not.toHaveBeenCalled();

    setItem.mockRestore();
    consoleError.mockRestore();
  });

  it('se elimina al cerrar la batalla', () => {
    saveCombatSession('free', { phase: 'battle', fen: 'fen-demo', registry: { e4: { type: 'p' } } });
    clearCombatSession('free');
    expect(loadCombatSession('free')).toBeNull();
  });
  it('restaura la batalla desde el respaldo local tras perder la sesión del navegador', () => {
    saveCombatSession('campaign:abc:n1', { phase: 'battle', fen: 'fen-demo', registry: { e4: { type: 'p' } }, humanColor: 'w' });
    sessionStorage.clear();
    clearStorageMemoryFallback();

    expect(loadCombatSession('campaign:abc:n1')?.fen).toBe('fen-demo');
  });
  it('recupera desde memoria si sessionStorage queda ilegible durante un remount', () => {
    saveCombatSession('campaign:abc:n1', { phase: 'battle', fen: 'fen-demo', registry: { e4: { type: 'p' } }, humanColor: 'w' });
    sessionStorage.setItem('chess-study-active-combat-session-v1', '{corrupto');

    expect(loadCombatSession('campaign:abc:n1')?.humanColor).toBe('w');
    expect(sessionStorage.getItem('chess-study-active-combat-session-v1')).toBeNull();
  });

  it('clear elimina también el respaldo en memoria', () => {
    saveCombatSession('campaign:abc:n1', { phase: 'battle', fen: 'fen-demo', registry: { e4: { type: 'p' } } });
    sessionStorage.setItem('chess-study-active-combat-session-v1', '{corrupto');
    clearCombatSession('campaign:abc:n1');
    expect(loadCombatSession('campaign:abc:n1')).toBeNull();
  });

});
