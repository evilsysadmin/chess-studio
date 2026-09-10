import { beforeEach, describe, expect, it } from 'vitest';
import {
  STORAGE_LOCAL,
  removeStorageItem,
  writeJsonStorage,
} from '../safeStorage.js';
import {
  WAR_ROOM_HANS_COMPLETED_GAMES_KEY,
  hasWarRoomHansCompletedForGame,
  markWarRoomHansCompletedForGame,
} from './WarRoomHansPerGame.js';

const LEGACY_SEEN_GAMES_KEY = 'chess-study-war-room-hans-seen-games-v1';

describe('WarRoomHansPerGame', () => {
  beforeEach(() => {
    removeStorageItem(STORAGE_LOCAL, WAR_ROOM_HANS_COMPLETED_GAMES_KEY);
    removeStorageItem(STORAGE_LOCAL, LEGACY_SEEN_GAMES_KEY);
  });

  it('persiste una secuencia completada una sola vez por game id', () => {
    expect(hasWarRoomHansCompletedForGame('game-4711')).toBe(false);
    expect(markWarRoomHansCompletedForGame('game-4711')).toBe(true);
    expect(hasWarRoomHansCompletedForGame('game-4711')).toBe(true);
    expect(markWarRoomHansCompletedForGame('game-4711')).toBe(false);
  });

  it('una partida nueva conserva su propio número pendiente', () => {
    expect(markWarRoomHansCompletedForGame('game-a')).toBe(true);
    expect(markWarRoomHansCompletedForGame('game-b')).toBe(true);
    expect(hasWarRoomHansCompletedForGame('game-a')).toBe(true);
    expect(hasWarRoomHansCompletedForGame('game-b')).toBe(true);
    expect(hasWarRoomHansCompletedForGame('game-c')).toBe(false);
  });

  it('ignora el viejo registro de apariciones prematuras', () => {
    writeJsonStorage(STORAGE_LOCAL, LEGACY_SEEN_GAMES_KEY, ['game-interrupted']);
    expect(hasWarRoomHansCompletedForGame('game-interrupted')).toBe(false);
  });

  it('no completa el número sin un id real de partida', () => {
    expect(markWarRoomHansCompletedForGame()).toBe(false);
    expect(markWarRoomHansCompletedForGame('')).toBe(false);
    expect(hasWarRoomHansCompletedForGame()).toBe(false);
  });
});
