import { beforeEach, describe, expect, it } from 'vitest';
import { loadGuidedTrainingSession, startGuidedTrainingSession } from './guidedTrainingSession.js';
import { GUIDED_TRAINING_SESSION_KEY, readGuidedGameOrigin } from './guidedTrainingOriginReader.js';

const NOW = 1_800_000_000_000;
const FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const plan = {
  available: true,
  minutes: 15,
  steps: [
    { id: 'short-practice-game', action: 'short-game', title: 'Partida corta de práctica',
      minutes: 6, training: { fen: FEN, humanColor: 'w', difficulty: 0 } },
    { id: 'review', action: 'review', title: 'Cierre rápido', minutes: 1 },
  ],
};

describe('lightweight guided game origin', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('acepta el bloque actual de una sesión real, incluso con nivel cero', () => {
    const started = startGuidedTrainingSession(plan, { now: NOW });
    expect(readGuidedGameOrigin({ now: NOW })).toMatchObject({
      id: started.id, currentIndex: 0,
      steps: [{ id: 'short-practice-game' }, { id: 'review' }],
    });
  });

  it('no hereda un origen de otro usuario ni acepta snapshots caducados', () => {
    localStorage.setItem('chess-study-auth-username', 'alice');
    startGuidedTrainingSession(plan, { now: NOW });
    localStorage.setItem('chess-study-auth-username', 'bob');
    expect(readGuidedGameOrigin({ now: NOW })).toBeNull();
    localStorage.setItem('chess-study-auth-username', 'alice');
    expect(readGuidedGameOrigin({ now: NOW + 5 * 60 * 60 * 1000 })).toBeNull();
  });

  it('no convierte la revisión u otro paso inválido en una partida entrenable', () => {
    const started = startGuidedTrainingSession(plan, { now: NOW });
    const put = (overrides) => sessionStorage.setItem(GUIDED_TRAINING_SESSION_KEY, JSON.stringify({ ...started, ...overrides }));
    put({ currentIndex: 1 });
    expect(readGuidedGameOrigin({ now: NOW })).toBeNull();
    put({ currentIndex: 8 });
    expect(readGuidedGameOrigin({ now: NOW })).toBeNull();
    put({ currentIndex: 0, steps: [{ ...started.steps[0], training: null }] });
    expect(readGuidedGameOrigin({ now: NOW })).toBeNull();
    put({ currentIndex: 0, id: '' });
    expect(readGuidedGameOrigin({ now: NOW })).toBeNull();
  });

  it('rechaza niveles CPU fuera de rango al iniciar o restaurar una sesión', () => {
    const withDifficulty = (difficulty) => ({
      ...plan,
      steps: [
        { ...plan.steps[0], training: { ...plan.steps[0].training, difficulty } },
        plan.steps[1],
      ],
    });
    for (const difficulty of [-1, 101]) {
      expect(startGuidedTrainingSession(withDifficulty(difficulty), { now: NOW })).toBeNull();
    }
    expect(sessionStorage.getItem(GUIDED_TRAINING_SESSION_KEY)).toBeNull();

    const saved = startGuidedTrainingSession(plan, { now: NOW });
    for (const difficulty of [-1, 101]) {
      sessionStorage.setItem(GUIDED_TRAINING_SESSION_KEY, JSON.stringify({
        ...saved, steps: withDifficulty(difficulty).steps,
      }));
      expect(readGuidedGameOrigin({ now: NOW })).toBeNull();
      expect(loadGuidedTrainingSession({ now: NOW })).toBeNull();
    }
    expect(startGuidedTrainingSession(plan, { now: NOW })?.steps[0].training.difficulty).toBe(0);
  });
});
