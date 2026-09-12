import { describe, expect, it } from 'vitest';
import { homeCastleKnownRoom, homeCastleRoomFocus } from './HomeCastle3DRoomFocus.js';

describe('HomeCastle3DRoomFocus', () => {
  it('maps every canonical destination to a bounded local focus', () => {
    for (const room of ['tournament', 'train', 'combat', 'daily', 'history', 'play']) {
      expect(homeCastleKnownRoom(room)).toBe(true);
      const focus = homeCastleRoomFocus(room);
      expect(Math.abs(focus.x)).toBeLessThanOrEqual(1.2);
      expect(Math.abs(focus.y)).toBeLessThanOrEqual(0.5);
      expect(focus.light).toBeGreaterThan(0);
      expect(focus.light).toBeLessThan(0.4);
    }
  });

  it('returns a neutral response for no focus or unknown destinations', () => {
    expect(homeCastleRoomFocus(null)).toEqual({ x: 0, y: 0, light: 0 });
    expect(homeCastleRoomFocus('not-a-room')).toEqual({ x: 0, y: 0, light: 0 });
    expect(homeCastleKnownRoom('not-a-room')).toBe(false);
  });

  it('keeps the primary play destination as the strongest focus', () => {
    const play = homeCastleRoomFocus('play');
    const secondary = ['tournament', 'train', 'combat', 'daily', 'history']
      .map((room) => homeCastleRoomFocus(room).light);
    expect(play.light).toBeGreaterThan(Math.max(...secondary));
  });
});
