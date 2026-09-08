import { describe, expect, it } from 'vitest';
import {
  WAR_ROOM_HANS_EVENTS,
  warRoomHansAmbientDelayMs,
  warRoomHansEventForGame,
  warRoomHansEventMatches,
} from './WarRoomHansEventContract.js';

describe('WarRoomHansEventContract', () => {
  it('selects exactly one stable event for a game id', () => {
    const gameId = 'game-hans-ambient-42';
    const first = warRoomHansEventForGame(gameId);
    const second = warRoomHansEventForGame(gameId);
    expect(WAR_ROOM_HANS_EVENTS).toContain(first);
    expect(second).toBe(first);
    expect(WAR_ROOM_HANS_EVENTS.filter((eventName) => warRoomHansEventMatches(gameId, eventName))).toEqual([first]);
  });

  it('does not select an event without a game id', () => {
    expect(warRoomHansEventForGame('')).toBe('');
  });

  it('keeps ambient delays bounded and stable per game/salt', () => {
    const delay = warRoomHansAmbientDelayMs('game-7', { min: 18000, max: 48000, salt: 'espresso' });
    expect(delay).toBeGreaterThanOrEqual(18000);
    expect(delay).toBeLessThanOrEqual(48000);
    expect(warRoomHansAmbientDelayMs('game-7', { min: 18000, max: 48000, salt: 'espresso' })).toBe(delay);
  });
});
