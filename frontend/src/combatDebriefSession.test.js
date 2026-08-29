import { beforeEach, describe, expect, it } from 'vitest';
import { clearStorageMemoryFallback } from './safeStorage.js';
import { clearCombatDebriefSession, loadCombatDebriefSession, saveCombatDebriefSession } from './combatDebriefSession.js';

describe('Combat Chess post-battle debrief session cache', () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearStorageMemoryFallback();
    clearCombatDebriefSession();
  });

  it('sobrevive a un remount/F5 lógico dentro del mismo encuentro', () => {
    const debrief = { outcome: 'win', totalKills: 3, creditsGained: 5 };
    expect(saveCombatDebriefSession('campaign:seed:n2', debrief)).toBe(true);
    expect(loadCombatDebriefSession('campaign:seed:n2')).toEqual(debrief);
  });

  it('no mezcla encuentros y permite limpiar sólo el que progresa', () => {
    saveCombatDebriefSession('campaign:seed:n2', { outcome: 'win' });
    saveCombatDebriefSession('run:seed:4', { outcome: 'win' });
    clearCombatDebriefSession('campaign:seed:n2');
    expect(loadCombatDebriefSession('campaign:seed:n2')).toBeNull();
    expect(loadCombatDebriefSession('run:seed:4')).toEqual({ outcome: 'win' });
  });

  it('clear global impide que el debrief cruce logout/login', () => {
    saveCombatDebriefSession('run:seed:4', { outcome: 'win' });
    clearCombatDebriefSession();
    expect(loadCombatDebriefSession('run:seed:4')).toBeNull();
  });
});
