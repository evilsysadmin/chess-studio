import { beforeEach, describe, expect, it } from 'vitest';
import {
  STORAGE_LOCAL,
  removeStorageItem,
} from '../safeStorage.js';
import {
  WAR_ROOM_HANS_SEEN_GAMES_KEY,
  hasWarRoomHansAppearedForGame,
  markWarRoomHansAppearedForGame,
} from './WarRoomHansPerGame.js';

describe('WarRoomHansPerGame', () => {
  beforeEach(() => {
    removeStorageItem(STORAGE_LOCAL, WAR_ROOM_HANS_SEEN_GAMES_KEY);
  });

  it('persiste una aparición confirmada una sola vez por game id', () => {
    expect(hasWarRoomHansAppearedForGame('game-4711')).toBe(false);
    expect(markWarRoomHansAppearedForGame('game-4711')).toBe(true);
    expect(hasWarRoomHansAppearedForGame('game-4711')).toBe(true);
    expect(markWarRoomHansAppearedForGame('game-4711')).toBe(false);
  });

  it('una partida nueva conserva su propio cameo', () => {
    expect(markWarRoomHansAppearedForGame('game-a')).toBe(true);
    expect(markWarRoomHansAppearedForGame('game-b')).toBe(true);
    expect(hasWarRoomHansAppearedForGame('game-a')).toBe(true);
    expect(hasWarRoomHansAppearedForGame('game-b')).toBe(true);
  });

  it('no consume el cameo sin un id real de partida', () => {
    expect(markWarRoomHansAppearedForGame()).toBe(false);
    expect(markWarRoomHansAppearedForGame('')).toBe(false);
    expect(hasWarRoomHansAppearedForGame()).toBe(false);
  });
});
