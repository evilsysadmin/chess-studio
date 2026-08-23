import { beforeEach, describe, expect, it } from 'vitest';
import { clearCombatSession, hasCombatSession, loadCombatSession, saveCombatSession } from './combatSession.js';

describe('Combat Chess active session snapshot', () => {
  beforeEach(() => sessionStorage.clear());

  it('restaura sólo la batalla cuyo id coincide', () => {
    saveCombatSession('campaign:abc:n1', { phase: 'battle', fen: 'fen-demo', registry: { e4: { type: 'p' } }, humanColor: 'w' });
    expect(hasCombatSession('campaign:abc:n1')).toBe(true);
    expect(loadCombatSession('campaign:abc:n1')?.humanColor).toBe('w');
    expect(loadCombatSession('campaign:abc:n2')).toBeNull();
  });

  it('se elimina al cerrar la batalla', () => {
    saveCombatSession('free', { phase: 'battle', fen: 'fen-demo', registry: { e4: { type: 'p' } } });
    clearCombatSession('free');
    expect(loadCombatSession('free')).toBeNull();
  });
  it('recupera desde memoria si sessionStorage queda ilegible durante un remount', () => {
    saveCombatSession('campaign:abc:n1', { phase: 'battle', fen: 'fen-demo', registry: { e4: { type: 'p' } }, humanColor: 'w' });
    sessionStorage.setItem('chess-study-active-combat-session-v1', '{corrupto');
    expect(loadCombatSession('campaign:abc:n1')?.humanColor).toBe('w');
  });

  it('clear elimina también el respaldo en memoria', () => {
    saveCombatSession('campaign:abc:n1', { phase: 'battle', fen: 'fen-demo', registry: { e4: { type: 'p' } } });
    sessionStorage.setItem('chess-study-active-combat-session-v1', '{corrupto');
    clearCombatSession('campaign:abc:n1');
    expect(loadCombatSession('campaign:abc:n1')).toBeNull();
  });

});
