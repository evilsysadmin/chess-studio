import { beforeEach, describe, expect, it } from 'vitest';
import {
  MATTHIAS_SESSION_CONTEXT_KEY,
  clearMatthiasSessionContext,
  matthiasSessionContext,
  matthiasSessionLabel,
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
    expect(matthiasSessionContext()).toMatchObject({ games: 3, wins: 1, draws: 1, losses: 1 });
    expect(matthiasSessionLabel(matthiasSessionContext())).toBe('Sesión · 3 partidas · 1V · 1T · 1D');
  });

  it('se reinicia en login explícito para no cruzar usuarios', () => {
    recordMatthiasSessionResult({ gameId: 'g1', outcome: 'loss' });
    expect(sessionStorage.getItem(MATTHIAS_SESSION_CONTEXT_KEY)).toBeTruthy();
    queueMatthiasLoginGreeting();
    expect(matthiasSessionContext().games).toBe(0);
  });

  it('tolera storage corrupto y puede limpiarse', () => {
    sessionStorage.setItem(MATTHIAS_SESSION_CONTEXT_KEY, '{roto');
    expect(matthiasSessionContext()).toMatchObject({ games: 0, wins: 0, draws: 0, losses: 0 });
    clearMatthiasSessionContext();
    expect(sessionStorage.getItem(MATTHIAS_SESSION_CONTEXT_KEY)).toBeNull();
  });
});
