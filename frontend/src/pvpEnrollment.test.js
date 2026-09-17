import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearPvpMatchSession,
  clearPvpSessionState,
  loadPvpEnrollment,
  loadPvpMatchSession,
  savePvpEnrollment,
  savePvpMatchSession,
} from './pvpEnrollment.js';

describe('PvP session state', () => {
  beforeEach(() => sessionStorage.clear());

  it('keeps roster availability inside the current authenticated tab session', () => {
    expect(loadPvpEnrollment()).toBe(false);
    savePvpEnrollment(true);
    expect(loadPvpEnrollment()).toBe(true);
    savePvpEnrollment(false);
    expect(loadPvpEnrollment()).toBe(false);
  });

  it('keeps an accepted 1v1 match across F5 without touching normal active-game storage', () => {
    expect(savePvpMatchSession({ id: 'm1', status: 'active' })).toBe(true);
    expect(loadPvpMatchSession()).toMatchObject({ id: 'm1' });
    clearPvpMatchSession();
    expect(loadPvpMatchSession()).toBeNull();
  });

  it('clears all PvP ephemeral state on explicit auth reset', () => {
    savePvpEnrollment(true);
    savePvpMatchSession({ id: 'm2' });
    clearPvpSessionState();
    expect(loadPvpEnrollment()).toBe(false);
    expect(loadPvpMatchSession()).toBeNull();
  });
});
