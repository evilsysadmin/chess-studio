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
  it('stores started / finished once per game and preserves the mode label', () => {
    recordGameActivity({ gameId: 'g-1', state: 'started', mode: 'sudden' });
    recordGameActivity({ gameId: 'g-1', state: 'started', mode: 'sudden' });
    recordGameActivity({ gameId: 'g-1', state: 'finished', mode: 'sudden', outcome: 'win', difficulty: 72 });
    const rows = loadGameActivity();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ gameId: 'g-1', state: 'finished', modeLabel: 'Muerte súbita', outcome: 'win', difficulty: 72 });
    expect(rows[1]).toMatchObject({ gameId: 'g-1', state: 'started', modeLabel: 'Muerte súbita' });
    expect(JSON.parse(sessionStorage.getItem('chess-study-matthias-session-context-v1'))).toMatchObject({ games: 1, wins: 1, losses: 0 });
  });

  it('does not record a cancellation after the same game has finished', () => {
    recordGameActivity({ gameId: 'g-2', state: 'started', mode: 'casual' });
    recordGameActivity({ gameId: 'g-2', state: 'finished', mode: 'casual', outcome: 'draw' });
    recordGameActivity({ gameId: 'g-2', state: 'cancelled', mode: 'casual' });
    expect(loadGameActivity().map((row) => row.state)).toEqual(['finished', 'started']);
  });
});
