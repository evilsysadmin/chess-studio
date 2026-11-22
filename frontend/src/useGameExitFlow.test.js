import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearGuidedTrainingSession, startGuidedTrainingSession } from './guidedTrainingSession.js';
import {
  CANCELLED_GAME_EXIT_NOTICE,
  gameExitTrainingPosition,
  isCurrentGuidedTrainingGame,
  resolveGameExit,
  useGameExitFlow,
} from './useGameExitFlow.js';

describe('game exit flow decisions', () => {
  it('conserva un resultado ya finalizado en vez de volver a puntuar la partida', () => {
    const result = { gameId: 'g-1', outcome: 'win', title: 'Victoria' };
    expect(resolveGameExit({
      gameId: 'g-1',
      casualResult: result,
      exitDisposition: 'forfeit',
    })).toEqual({ kind: 'completed', notice: result });
  });

  it('distingue abandono competitivo de cancelación inocua', () => {
    expect(resolveGameExit({
      gameId: 'g-2',
      casualResult: null,
      exitDisposition: 'forfeit',
    })).toEqual({ kind: 'forfeit', notice: null });

    expect(resolveGameExit({
      gameId: 'g-3',
      casualResult: null,
      exitDisposition: 'cancel',
    })).toEqual({ kind: 'cancelled', notice: CANCELLED_GAME_EXIT_NOTICE });
  });

  it('marca como entrenamiento sólo los contextos que ya eran no competitivos', () => {
    expect(gameExitTrainingPosition({ lab: true })).toBe(true);
    expect(gameExitTrainingPosition({ rescue: true })).toBe(true);
    expect(gameExitTrainingPosition({ suddenDeath: true })).toBe(true);
    expect(gameExitTrainingPosition({ threatCheck: true })).toBe(false);
    expect(gameExitTrainingPosition({})).toBe(false);
  });
});

describe('guided practice return after live game/F5', () => {
  const initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const plan = {
    available: true,
    minutes: 15,
    steps: [
      { id: 'short-game', action: 'short-game', title: 'Partida corta de práctica', minutes: 6,
        training: { fen: initialFen, humanColor: 'w', difficulty: 0 } },
      { id: 'review', action: 'review', title: 'Cierre rápido', minutes: 1 },
    ],
  };

  const NOW = 1_800_000_000_000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => vi.useRealTimers());

  function fixture(context) {
    const back = vi.fn();
    const flow = useGameExitFlow({
      game: { id: 'guidance-game', difficulty: 0 },
      casualResult: { gameId: 'guidance-game', outcome: 'win' },
      gameContext: context,
      learningMode: true,
      finish: vi.fn(),
      notice: vi.fn(),
      saved: vi.fn(),
      setGame: vi.fn(),
      learning: vi.fn(),
      contract: vi.fn(),
      context: vi.fn(),
      series: vi.fn(),
      back,
    });
    return { flow, back };
  }

  it('recupera exactamente la sesión de origen sin conceder un avance automático', () => {
    const session = startGuidedTrainingSession(plan);
    const gameContext = { lab: true, guidedTraining: { sessionId: session.id, stepId: 'short-game' } };
    expect(isCurrentGuidedTrainingGame(gameContext, session)).toBe(true);
    const { flow, back } = fixture(gameContext);
    flow();
    expect(back).toHaveBeenCalledExactlyOnceWith('insights');
    const recovered = JSON.parse(sessionStorage.getItem('chess-study-guided-training-session-v1'));
    expect(recovered).toMatchObject({ id: session.id, currentIndex: 0 });
  });

  it('no secuestra el retorno de un plan cancelado, sustituido o ya avanzado', () => {
    const session = startGuidedTrainingSession(plan);
    const origin = { lab: true, guidedTraining: { sessionId: session.id, stepId: 'short-game' } };
    expect(isCurrentGuidedTrainingGame(origin, { ...session, currentIndex: 1 })).toBe(false);
    expect(isCurrentGuidedTrainingGame({ lab: true }, session)).toBe(false);

    clearGuidedTrainingSession();
    const cancelled = fixture(origin);
    cancelled.flow();
    expect(cancelled.back).toHaveBeenCalledExactlyOnceWith();

    const replacement = startGuidedTrainingSession(plan, { now: NOW + 1000 });
    expect(replacement.id).not.toBe(session.id);
    expect(isCurrentGuidedTrainingGame(origin, replacement)).toBe(false);
    const stale = fixture(origin);
    stale.flow();
    expect(stale.back).toHaveBeenCalledExactlyOnceWith();
  });
});
