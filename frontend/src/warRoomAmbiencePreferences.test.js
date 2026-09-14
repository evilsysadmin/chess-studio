import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WAR_ROOM_AMBIENCE_CHANGED_EVENT,
  isWarRoomAmbienceMuted,
  setWarRoomAmbienceMuted,
} from './warRoomAmbiencePreferences.js';

describe('War Room ambience preference', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to audible and persists a device-local mute independently of global FX', () => {
    expect(isWarRoomAmbienceMuted()).toBe(false);

    setWarRoomAmbienceMuted(true);
    expect(isWarRoomAmbienceMuted()).toBe(true);
    expect(localStorage.getItem('chess-study-fx-muted')).toBeNull();

    setWarRoomAmbienceMuted(false);
    expect(isWarRoomAmbienceMuted()).toBe(false);
  });

  it('notifies the mounted War Room immediately when a browser window is available', () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal('Event', class TestEvent {
      constructor(type) {
        this.type = type;
      }
    });

    setWarRoomAmbienceMuted(true);

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].type).toBe(WAR_ROOM_AMBIENCE_CHANGED_EVENT);
  });
});
