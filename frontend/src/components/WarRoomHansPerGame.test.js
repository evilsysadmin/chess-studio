import { beforeEach, describe, expect, it } from 'vitest';
import {
  STORAGE_LOCAL,
  removeStorageItem,
} from '../safeStorage.js';
import {
  WAR_ROOM_HANS_SEEN_GAMES_KEY,
  claimWarRoomHansAppearanceForGame,
  hasWarRoomHansAppearedForGame,
} from './WarRoomHansPerGame.js';

describe('WarRoomHansPerGame', () => {
  beforeEach(() => {
    removeStorageItem(STORAGE_LOCAL, WAR_ROOM_HANS_SEEN_GAMES_KEY);
  });

  it('permite una sola aparición de Hans por game id incluso tras reconstruir el tablero', () => {
    expect(hasWarRoomHansAppearedForGame('game-4711')).toBe(false);
    expect(claimWarRoomHansAppearanceForGame('game-4711')).toBe(true);
    expect(hasWarRoomHansAppearedForGame('game-4711')).toBe(true);
    expect(claimWarRoomHansAppearanceForGame('game-4711')).toBe(false);
  });

  it('una partida nueva recibe su propio cameo', () => {
    expect(claimWarRoomHansAppearanceForGame('game-a')).toBe(true);
    expect(claimWarRoomHansAppearanceForGame('game-b')).toBe(true);
    expect(claimWarRoomHansAppearanceForGame('game-a')).toBe(false);
  });

  it('mantiene compatibilidad con callers sin id real', () => {
    expect(claimWarRoomHansAppearanceForGame()).toBe(true);
    expect(claimWarRoomHansAppearanceForGame('')).toBe(true);
  });
});
