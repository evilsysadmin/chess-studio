import { beforeEach, describe, expect, it } from 'vitest';
import {
  MATTHIAS_SESSION_CONTEXT_KEY,
  clearMatthiasSessionContext,
  matthiasSessionContext,
  matthiasSessionLabel,
  recordMatthiasSessionPuzzle,
  recordMatthiasSessionResult,
} from './matthiasSessionContext.js';
import { queueMatthiasLoginGreeting } from './matthiasSession.js';

describe('Matthias session context', () => {
  beforeEach(() => sessionStorage.clear());

  it('cuenta sólo resultados terminados únicos de la pestaña', () => {
    recordMatthiasSessionResult({ gameId: 'g1', outcome: 'win' });
    recordMatthiasSessionResult({ gameId: 'g1', outcome: 'win' });
    recordMatthiasSessionResult({ gameId: 'g2', outcome: 'loss' });
    recordMatthiasSessionResult({ gameId: 'g3', outcome: 'draw' });
    expect(matthiasSessionContext()).toMatchObject({ games: 3, wins: 1, draws: 1, losses: 1, puzzlesSolved: 0 });
    expect(matthiasSessionLabel(matthiasSessionContext())).toBe('Sesión · 3 partidas · 1V · 1T · 1D');
  });

  it('añade puzzles resueltos a la misma sesión sin contaminar el balance de partidas', () => {
    recordMatthiasSessionResult({ gameId: 'g1', outcome: 'win' });
    recordMatthiasSessionPuzzle();
    recordMatthiasSessionPuzzle();
    expect(matthiasSessionContext()).toMatchObject({ games: 1, wins: 1, puzzlesSolved: 2 });
    expect(matthiasSessionLabel(matthiasSessionContext())).toBe('Sesión · 1 partida · 1V · 0T · 0D · 2 puzzles');
  });

  it('se reinicia en login explícito para no cruzar usuarios', () => {
    recordMatthiasSessionResult({ gameId: 'g1', outcome: 'loss' });
    recordMatthiasSessionPuzzle();
    expect(sessionStorage.getItem(MATTHIAS_SESSION_CONTEXT_KEY)).toBeTruthy();
    queueMatthiasLoginGreeting();
    expect(matthiasSessionContext()).toMatchObject({ games: 0, puzzlesSolved: 0 });
  });

  it('tolera storage corrupto y puede limpiarse', () => {
    sessionStorage.setItem(MATTHIAS_SESSION_CONTEXT_KEY, '{roto');
    expect(matthiasSessionContext()).toMatchObject({ games: 0, wins: 0, draws: 0, losses: 0, puzzlesSolved: 0 });
    clearMatthiasSessionContext();
    expect(sessionStorage.getItem(MATTHIAS_SESSION_CONTEXT_KEY)).toBeNull();
  });
});
