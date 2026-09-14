import { beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('defaults to audible and persists a device-local mute independently of global FX', () => {
    expect(isWarRoomAmbienceMuted()).toBe(false);

    setWarRoomAmbienceMuted(true);
    expect(isWarRoomAmbienceMuted()).toBe(true);
    expect(localStorage.getItem('chess-study-fx-muted')).toBeNull();

    setWarRoomAmbienceMuted(false);
    expect(isWarRoomAmbienceMuted()).toBe(false);
  });

  it('notifies the mounted War Room immediately when the control changes', () => {
    const listener = vi.fn();
    window.addEventListener(WAR_ROOM_AMBIENCE_CHANGED_EVENT, listener);

    setWarRoomAmbienceMuted(true);

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(WAR_ROOM_AMBIENCE_CHANGED_EVENT, listener);
  });
});
