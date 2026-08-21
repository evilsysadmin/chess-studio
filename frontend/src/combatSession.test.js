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
});
