import { beforeEach, describe, expect, it } from 'vitest';
import { clearStorageMemoryFallback } from './safeStorage.js';
import { createCombatRosterActions } from './combatRosterActions.js';
import { resetRoster } from './combatRoster.js';

describe('combat roster actions', () => {
  beforeEach(() => { localStorage.clear(); clearStorageMemoryFallback(); });
  it('centraliza mutaciones de roster y marca deployment como sucio cuando toca', () => {
    let state = resetRoster({ persist: false });
    const setRoster = (updater) => { state = typeof updater === 'function' ? updater(state) : updater; };
    let confirmed = true;
    const actions = createCombatRosterActions({ setRoster, requireDeploymentConfirmation: true, setDeploymentConfirmed: (value) => { confirmed = value; } });
    const key = Object.keys(state.identities)[0];
    state = {
      ...state,
      pieces: {
        ...state.pieces,
        [key]: { strengthPoints: 0, speedPoints: 0, bankedXp: 0, alive: true, deploymentType: null },
      },
    };
    actions.rename(key, 'Prueba');
    expect(state.identities[key].alias).toBe('Prueba');
    actions.metamorphose(key, state.pieces[key].deploymentType || key.split('-')[0]);
    expect(confirmed).toBe(false);
  });
});
