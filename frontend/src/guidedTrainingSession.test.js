import { beforeEach, describe, expect, it } from 'vitest';
import {
  GUIDED_TRAINING_SESSION_KEY,
  advanceGuidedTrainingSession,
  buildGuidedTrainingPlan,
  loadGuidedTrainingSession,
  startGuidedTrainingSession,
} from './guidedTrainingSession.js';

const debtPuzzles = [
  { id: 'p1', source: 'autopsy', sourceGameId: 'g1', incidentKeys: ['human:MISSED_MATE'], cleanSolves: 1 },
  { id: 'p2', source: 'autopsy', sourceGameId: 'g2', incidentKeys: ['human:MISSED_MATE'], cleanSolves: 0 },
];

describe('sesiones guiadas 15/30 minutos', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('no inventa una sesión cuando no existe material personal ni Némesis demostrada', () => {
    const plan = buildGuidedTrainingPlan({ minutes: 15, history: [], puzzles: [], rivalry: {} });
    expect(plan.available).toBe(false);
    expect(plan.steps).toEqual([]);
    expect(plan.reason).toContain('Aún no hay errores personales');
  });

  it('prioriza deuda real, añade práctica sin rating y respeta exactamente el presupuesto', () => {
    const plan15 = buildGuidedTrainingPlan({ minutes: 15, history: [], puzzles: debtPuzzles, rivalry: {} });
    const plan30 = buildGuidedTrainingPlan({ minutes: 30, history: [], puzzles: debtPuzzles, rivalry: {} });

    expect(plan15.available).toBe(true);
    expect(plan15.steps[0]).toMatchObject({ kind: 'debt', action: 'personal-filter', minutes: 8 });
    expect(plan15.steps.find((step) => step.kind === 'short-game')).toMatchObject({
      action: 'short-game',
      minutes: 6,
      training: { humanColor: 'w', difficulty: 50 },
    });
    expect(plan15.steps.reduce((sum, step) => sum + step.minutes, 0)).toBe(15);
    expect(plan30.steps.reduce((sum, step) => sum + step.minutes, 0)).toBe(30);
    expect(plan30.steps[0].minutes).toBe(16);
  });

  it('ajusta la práctica desde datos recientes sin convertirlos en una afirmación inventada', () => {
    const history = [
      { id: 'g1', difficulty: 40, humanColor: 'b' },
      { id: 'g2', difficulty: 60, humanColor: 'b' },
    ];
    const plan = buildGuidedTrainingPlan({ minutes: 15, history, puzzles: debtPuzzles, rivalry: {} });
    const practice = plan.steps.find((step) => step.kind === 'short-game');
    expect(practice.training.difficulty).toBe(50);
    expect(practice.training.humanColor).toBe('b');
    expect(practice.training.fen).toContain('rnbqkbnr');
  });

  it('conserva el paso actual en sessionStorage y lo elimina al terminar', () => {
    const now = Date.now();
    const plan = buildGuidedTrainingPlan({ minutes: 15, history: [], puzzles: debtPuzzles, rivalry: {} });
    const started = startGuidedTrainingSession(plan, { now });
    expect(started.currentIndex).toBe(0);
    expect(loadGuidedTrainingSession({ now })).toMatchObject({ id: started.id, currentIndex: 0, minutes: 15 });

    let session = advanceGuidedTrainingSession(started);
    expect(session.currentIndex).toBe(1);
    session = advanceGuidedTrainingSession(session);
    expect(session.currentIndex).toBe(2);
    session = advanceGuidedTrainingSession(session);
    expect(session).toBeNull();
    expect(sessionStorage.getItem(GUIDED_TRAINING_SESSION_KEY)).toBeNull();
  });

  it('descarta sesiones viejas en vez de resucitarlas en otra visita', () => {
    const now = Date.now();
    sessionStorage.setItem(GUIDED_TRAINING_SESSION_KEY, JSON.stringify({
      schema: 1,
      id: 'stale',
      minutes: 15,
      startedAt: now - 5 * 60 * 60 * 1000,
      currentIndex: 0,
      steps: [{ id: 'x', title: 'viejo', minutes: 15 }],
    }));
    expect(loadGuidedTrainingSession({ now })).toBeNull();
    expect(sessionStorage.getItem(GUIDED_TRAINING_SESSION_KEY)).toBeNull();
  });
});
