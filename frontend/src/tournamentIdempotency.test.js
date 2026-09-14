import { beforeEach, describe, expect, it } from 'vitest';
import { saveActiveGameSession } from './activeGameSession.js';
import { applyResult, loadTournament, saveTournament } from './tournament.js';

beforeEach(() => localStorage.clear());

describe('tournament result idempotency by game', () => {
  it('no suma dos veces progreso, marcador ni racha aunque el retry use estado viejo', () => {
    saveActiveGameSession({ route: 'tournamentGame', game: { id: 'tournament-g1' } });
    const staleState = { points: 7, progressPoints: 45, wins: 2, draws: 1, losses: 0, winStreak: 2, bestWinStreak: 2 };

    const first = applyResult(staleState, 'win');
    expect(first).toMatchObject({ gained: 20, leveledUp: true, newLevel: 2, duplicate: false });
    saveTournament(first.state);

    const retry = applyResult(staleState, 'win');
    expect(retry).toMatchObject({ gained: 20, leveledUp: true, newLevel: 2, duplicate: true });
    expect(retry.state).toMatchObject({ progressPoints: 65, wins: 3, winStreak: 3, bestWinStreak: 3 });
    expect(retry.state.processedGameIds).toContain('tournament-g1');

    saveTournament(retry.state);
    expect(loadTournament()).toMatchObject({ progressPoints: 65, wins: 3, draws: 1, losses: 0, winStreak: 3, bestWinStreak: 3 });
  });

  it('una partida nueva sí puede avanzar después de una ya procesada', () => {
    saveActiveGameSession({ route: 'tournamentGame', game: { id: 'tournament-g1' } });
    const first = applyResult(loadTournament(), 'win');
    saveTournament(first.state);

    saveActiveGameSession({ route: 'tournamentGame', game: { id: 'tournament-g2' } });
    const second = applyResult(loadTournament(), 'draw');
    expect(second.duplicate).toBe(false);
    expect(second.state).toMatchObject({ progressPoints: 25, wins: 1, draws: 1 });
    expect(second.state.processedGameIds).toEqual(expect.arrayContaining(['tournament-g1', 'tournament-g2']));
  });
});
