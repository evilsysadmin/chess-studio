import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api.js';
import { resolveTrainingDifficulty } from './trainingDifficulty.js';
import {
  gameContextFromOptions,
  guidedOriginForLaunch,
  labContextFromMeta,
  shouldOfferCasualContract,
  useGameStartFlow,
} from './useGameStartFlow.js';

describe('game start flow decisions', () => {
  it('normaliza el contexto de partida sin inventar flags', () => {
    expect(gameContextFromOptions({
      rematch: 1,
      adaptiveDifficulty: true,
      runMode: 'boss',
      rescue: true,
    })).toEqual({
      rematch: true,
      adaptiveDifficulty: true,
      runMode: 'boss',
      lab: false,
      rescue: true,
      suddenDeath: false,
      threatCheck: false,
    });
  });

  it('ofrece reto sólo a una partida casual individual', () => {
    expect(shouldOfferCasualContract()).toBe(true);
    expect(shouldOfferCasualContract({ learning: true })).toBe(false);
    expect(shouldOfferCasualContract({ options: { seriesBestOf: 3 } })).toBe(false);
    expect(shouldOfferCasualContract({ options: { lab: true } })).toBe(false);
    expect(shouldOfferCasualContract({ options: { rescue: true } })).toBe(false);
    expect(shouldOfferCasualContract({ options: { runMode: 'streak' } })).toBe(false);
  });

  it('identifica solo el bloque activo con FEN, color, fuerza y contexto idénticos', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const session = {
      id: 'guided-real-15', currentIndex: 0,
      steps: [{ id: 'short-game', action: 'short-game', training: { fen, humanColor: 'w', difficulty: 0 } }],
    };
    const request = { sourceView: 'insights', session, fen, humanColor: 'w', difficulty: 0 };
    expect(guidedOriginForLaunch(request)).toEqual({
      guidedTrainingSessionId: session.id,
      guidedTrainingStepId: 'short-game',
    });
    for (const different of [
      { sourceView: 'lab' },
      { session: null },
      { session: { ...session, currentIndex: 1 } },
      { fen: fen.replace(' w ', ' b ') },
      { humanColor: 'b' },
      { difficulty: 50 },
      { meta: { nemesis: true } },
    ]) {
      expect(guidedOriginForLaunch({ ...request, ...different })).toBeNull();
    }
  });

  it('adjunta origen guiado sólo cuando la sesión y el bloque están identificados', () => {
    expect(labContextFromMeta({
      guidedTrainingSessionId: 'guided-1700000-15',
      guidedTrainingStepId: 'short-game',
    })).toMatchObject({
      lab: true,
      guidedTraining: { sessionId: 'guided-1700000-15', stepId: 'short-game' },
    });
    expect(labContextFromMeta({
      guidedTrainingSessionId: 'guided-1700000-15',
    })).not.toHaveProperty('guidedTraining');
    expect(labContextFromMeta({})).not.toHaveProperty('guidedTraining');
  });

  it('conserva sólo el contexto demostrable al arrancar desde laboratorio', () => {
    expect(labContextFromMeta({
      rescue: true,
      nemesis: true,
      nemesisLabel: 'Caro-Kann',
      nemesisOpening: 'B10',
      sourceRecord: { id: 'game-42' },
    })).toEqual({
      lab: true,
      rescue: true,
      nemesis: true,
      nemesisLabel: 'Caro-Kann',
      nemesisOpening: 'B10',
      sourceRecordId: 'game-42',
    });
  });
});

describe('training difficulty fidelity', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('acepta el nivel cero real y descarta dificultades legacy desconocidas', () => {
    expect(resolveTrainingDifficulty(0)).toBe(0);
    expect(resolveTrainingDifficulty('0')).toBe(0);
    expect(resolveTrainingDifficulty(72)).toBe(72);
    expect(resolveTrainingDifficulty('72')).toBe(72);
    for (const missing of [null, undefined, '', '  ', false, true, 'broken', -1, 110, Infinity]) {
      expect(resolveTrainingDifficulty(missing)).toBe(50);
    }
  });

  it('envía a la API nivel cero al reanudar una posición Némesis, sin subirlo a 50', async () => {
    const createGame = vi.spyOn(api, 'createGame')
      .mockResolvedValue({ id: 'test-nemesis-zero', difficulty: 0, humanColor: 'w' });
    const operation = { controller: new AbortController() };
    const launch = {
      begin: () => operation,
      operationId: () => 'operation-nemesis-zero',
      isCurrent: () => true,
      confirmCreated: vi.fn(),
      owns: () => true,
      end: vi.fn(),
    };
    const setGame = vi.fn();
    const navigate = vi.fn();
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const flow = useGameStartFlow({
      launch,
      navigate,
      loading: vi.fn(),
      error: vi.fn(),
      rating: { rating: 400 },
      gameCount: 0,
      setGame,
      saved: vi.fn(),
      learning: vi.fn(),
      timeControl: vi.fn(),
      context: vi.fn(),
      contract: vi.fn(),
      series: vi.fn(),
      run: vi.fn(),
      resetResult: vi.fn(),
    });

    await flow.playFromHere(fen, 'w', 0, { nemesis: true, sourceRecord: { id: 'record-0' } });
    expect(createGame).toHaveBeenCalledWith(0, 'w', null, fen, expect.objectContaining({
      operationId: 'operation-nemesis-zero',
    }));
    expect(setGame).toHaveBeenCalledWith(expect.objectContaining({ id: 'test-nemesis-zero', difficulty: 0 }));
    expect(navigate).toHaveBeenCalledWith('game');
    expect(launch.confirmCreated).toHaveBeenCalledWith(operation);
  });
});
