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
  it('stores started / finished once per game and exposes mode, level and board renderer', () => {
    recordGameActivity({ gameId: 'g-1', state: 'started', mode: 'sudden', boardRenderer: '2d' });
    recordGameActivity({ gameId: 'g-1', state: 'started', mode: 'sudden', boardRenderer: '3d' });
    recordGameActivity({ gameId: 'g-1', state: 'finished', mode: 'sudden', outcome: 'win', difficulty: 72, boardRenderer: '3d' });
    const rows = loadGameActivity();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ gameId: 'g-1', state: 'finished', modeLabel: 'Muerte súbita · 3D', outcome: 'win', difficulty: 72, boardRenderer: '3d' });
    expect(rows[1]).toMatchObject({ gameId: 'g-1', state: 'started', modeLabel: 'Muerte súbita · 2D', boardRenderer: '2d' });
    expect(JSON.parse(sessionStorage.getItem('chess-study-matthias-session-context-v1'))).toMatchObject({ games: 1, wins: 1, losses: 0 });
  });

  it('preserva dificultad desconocida como null y no la inventa como nivel cero', () => {
    recordGameActivity({ gameId: 'g-missing', state: 'started', mode: 'casual', detail: 'adaptive-difficulty' });
    recordGameActivity({ gameId: 'g-missing', state: 'finished', mode: 'casual', outcome: 'draw', difficulty: null });
    expect(loadGameActivity().filter((row) => row.gameId === 'g-missing').map((row) => row.difficulty))
      .toEqual([null, null]);

    recordGameActivity({ gameId: 'g-blank', state: 'started', difficulty: '  ' });
    recordGameActivity({ gameId: 'g-boolean', state: 'started', difficulty: false });
    recordGameActivity({ gameId: 'g-invalid', state: 'started', difficulty: 'imposible' });
    expect(loadGameActivity().filter((row) => ['g-blank', 'g-boolean', 'g-invalid'].includes(row.gameId))
      .map((row) => row.difficulty)).toEqual([null, null, null]);
  });

  it('mantiene dificultad cero explícita y valores numéricos recibidos como texto', () => {
    recordGameActivity({ gameId: 'g-zero', state: 'started', difficulty: 0 });
    recordGameActivity({ gameId: 'g-sixty', state: 'started', difficulty: '60' });
    expect(loadGameActivity().find((row) => row.gameId === 'g-zero').difficulty).toBe(0);
    expect(loadGameActivity().find((row) => row.gameId === 'g-sixty').difficulty).toBe(60);
  });

  it('does not record a cancellation after the same game has finished', () => {
    recordGameActivity({ gameId: 'g-2', state: 'started', mode: 'casual', boardRenderer: '2d' });
    recordGameActivity({ gameId: 'g-2', state: 'finished', mode: 'casual', outcome: 'draw', boardRenderer: '2d' });
    recordGameActivity({ gameId: 'g-2', state: 'cancelled', mode: 'casual', boardRenderer: '2d' });
    expect(loadGameActivity().map((row) => row.state)).toEqual(['finished', 'started']);
  });

  it('treats cancellation as terminal against late finish or restart events', () => {
    recordGameActivity({ gameId: 'g-cancelled', state: 'started', mode: 'casual', boardRenderer: '2d' });
    recordGameActivity({ gameId: 'g-cancelled', state: 'cancelled', mode: 'casual', boardRenderer: '2d' });
    recordGameActivity({ gameId: 'g-cancelled', state: 'finished', mode: 'casual', outcome: 'loss', boardRenderer: '2d' });
    recordGameActivity({ gameId: 'g-cancelled', state: 'started', mode: 'casual', boardRenderer: '3d' });
    expect(loadGameActivity().map((row) => row.state)).toEqual(['cancelled', 'started']);
  });

  it('rejects finished lifecycle entries without a completed chess outcome', () => {
    recordGameActivity({ gameId: 'g-invalid', state: 'started', mode: 'casual' });
    recordGameActivity({ gameId: 'g-invalid', state: 'finished', mode: 'casual', outcome: null });
    recordGameActivity({ gameId: 'g-invalid', state: 'finished', mode: 'casual', outcome: 'retired' });
    expect(loadGameActivity().map((row) => row.state)).toEqual(['started']);
  });

  it('does not attribute the normal 2D/3D preference to Combat Chess', () => {
    recordGameActivity({ gameId: 'combat-1', state: 'started', mode: 'combat' });
    expect(loadGameActivity()[0]).toMatchObject({ gameId: 'combat-1', boardRenderer: null });
  });
});
