import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadGameActivity, recordGameActivity } from './gameActivity.js';

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-23T10:00:00Z'));
});

describe('game activity lifecycle', () => {
  it('stores started / finished once per game and preserves mode, level and board renderer', () => {
    recordGameActivity({ gameId: 'g-1', state: 'started', mode: 'sudden', boardRenderer: '2d' });
    recordGameActivity({ gameId: 'g-1', state: 'started', mode: 'sudden', boardRenderer: '3d' });
    recordGameActivity({ gameId: 'g-1', state: 'finished', mode: 'sudden', outcome: 'win', difficulty: 72, boardRenderer: '3d' });
    const rows = loadGameActivity();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ gameId: 'g-1', state: 'finished', modeLabel: 'Muerte súbita', outcome: 'win', difficulty: 72, boardRenderer: '3d' });
    expect(rows[1]).toMatchObject({ gameId: 'g-1', state: 'started', modeLabel: 'Muerte súbita', boardRenderer: '2d' });
    expect(JSON.parse(sessionStorage.getItem('chess-study-matthias-session-context-v1'))).toMatchObject({ games: 1, wins: 1, losses: 0 });
  });

  it('does not record a cancellation after the same game has finished', () => {
    recordGameActivity({ gameId: 'g-2', state: 'started', mode: 'casual', boardRenderer: '2d' });
    recordGameActivity({ gameId: 'g-2', state: 'finished', mode: 'casual', outcome: 'draw', boardRenderer: '2d' });
    recordGameActivity({ gameId: 'g-2', state: 'cancelled', mode: 'casual', boardRenderer: '2d' });
    expect(loadGameActivity().map((row) => row.state)).toEqual(['finished', 'started']);
  });

  it('does not attribute the normal 2D/3D preference to Combat Chess', () => {
    recordGameActivity({ gameId: 'combat-1', state: 'started', mode: 'combat' });
    expect(loadGameActivity()[0]).toMatchObject({ gameId: 'combat-1', boardRenderer: null });
  });
});
