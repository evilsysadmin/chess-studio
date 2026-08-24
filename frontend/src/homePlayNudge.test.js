import { beforeEach, describe, expect, it } from 'vitest';
import {
  HOME_PLAY_NUDGE_COOLDOWN_MS,
  HOME_PLAY_NUDGE_LAST_AT_KEY,
  HOME_PLAY_NUDGE_SESSION_KEY,
  canShowHomePlayNudge,
  clearHomePlayNudgeSession,
  homePlayNudgeIsCoolingDown,
  markHomePlayNudgeShown,
} from './homePlayNudge.js';

describe('Home play nudge · frecuencia', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('puede mostrarse al principio de una sesión sin cooldown', () => {
    expect(canShowHomePlayNudge({ now: 1_000 })).toBe(true);
  });

  it('al mostrarse queda bloqueado durante la sesión y arranca cooldown persistente', () => {
    markHomePlayNudgeShown({ now: 10_000 });

    expect(sessionStorage.getItem(HOME_PLAY_NUDGE_SESSION_KEY)).toBe('1');
    expect(localStorage.getItem(HOME_PLAY_NUDGE_LAST_AT_KEY)).toBe('10000');
    expect(canShowHomePlayNudge({ now: 10_001 })).toBe(false);
    expect(homePlayNudgeIsCoolingDown(10_001)).toBe(true);
  });

  it('un login nuevo limpia la marca de sesión pero respeta el cooldown largo', () => {
    markHomePlayNudgeShown({ now: 20_000 });
    clearHomePlayNudgeSession();

    expect(sessionStorage.getItem(HOME_PLAY_NUDGE_SESSION_KEY)).toBeNull();
    expect(canShowHomePlayNudge({ now: 20_001 })).toBe(false);
    expect(canShowHomePlayNudge({ now: 20_000 + HOME_PLAY_NUDGE_COOLDOWN_MS + 1 })).toBe(true);
  });

  it('storage bloqueado no puede romper la Home', () => {
    const brokenStorage = {
      getItem() { throw new Error('blocked'); },
      setItem() { throw new Error('blocked'); },
      removeItem() { throw new Error('blocked'); },
    };

    expect(canShowHomePlayNudge({ now: 30_000, session: brokenStorage, persistent: brokenStorage })).toBe(true);
    expect(() => markHomePlayNudgeShown({ now: 30_000, session: brokenStorage, persistent: brokenStorage })).not.toThrow();
    expect(() => clearHomePlayNudgeSession(brokenStorage)).not.toThrow();
  });
});
