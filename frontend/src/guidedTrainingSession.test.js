import { beforeEach, describe, expect, it } from 'vitest';
import {
  GUIDED_TRAINING_SESSION_KEY,
  advanceGuidedTrainingSession,
  buildGuidedTrainingPlan,
  loadGuidedTrainingSession,
  startGuidedTrainingSession,
} from './guidedTrainingSession.js';

const NOW = 1_800_000_000_000;
const debtPuzzles = [
  { id: 'p1', source: 'autopsy', sourceGameId: 'g1', incidentKeys: ['human:MISSED_MATE'], cleanSolves: 1 },
  { id: 'p2', source: 'autopsy', sourceGameId: 'g2', incidentKeys: ['human:MISSED_MATE'], cleanSolves: 0 },
];

describe('sesiones guiadas 5/15/30 minutos', () => {
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

  it('usa los cinco minutos como bloque express en un único foco factual más cierre', () => {
    const plan = buildGuidedTrainingPlan({ minutes: 5, history: [], puzzles: debtPuzzles, rivalry: {} });

    expect(plan.available).toBe(true);
    expect(plan.minutes).toBe(5);
    expect(plan.steps).toEqual([
      expect.objectContaining({ kind: 'debt', action: 'personal-filter', minutes: 4 }),
      expect.objectContaining({ kind: 'review', action: 'review', minutes: 1 }),
    ]);
    expect(plan.steps.some((step) => step.kind === 'short-game')).toBe(false);
    expect(plan.steps.reduce((sum, step) => sum + step.minutes, 0)).toBe(5);
  });

  it('prioriza deuda real, añade práctica sin rating y respeta exactamente los presupuestos largos', () => {
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

  it('toma la deuda focal del Player Model sin recalcularla en la sesión', () => {
    const plan = buildGuidedTrainingPlan({
      minutes: 15,
      history: [],
      puzzles: [],
      rivalry: {},
      playerModel: {
        trainingDebt: {
          top: {
            incidentKey: 'human:ALLOWED_MATE',
            label: 'Mates que regalaste',
            progress: 1,
            target: 2,
            cases: 3,
            paid: false,
          },
        },
      },
    });

    expect(plan.available).toBe(true);
    expect(plan.steps[0]).toMatchObject({
      id: 'debt:human:ALLOWED_MATE',
      kind: 'debt',
      action: 'personal-filter',
      filter: { incidentKey: 'human:ALLOWED_MATE' },
    });
    expect(plan.steps[0].title).toContain('Mates que regalaste');
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

  it('persiste también una sesión express de cinco minutos sin normalizarla a quince', () => {
    const plan = buildGuidedTrainingPlan({ minutes: 5, history: [], puzzles: debtPuzzles, rivalry: {} });
    const started = startGuidedTrainingSession(plan, { now: NOW });

    expect(started).toMatchObject({ minutes: 5, currentIndex: 0 });
    expect(loadGuidedTrainingSession({ now: NOW })).toMatchObject({ id: started.id, minutes: 5, currentIndex: 0 });

    const review = advanceGuidedTrainingSession(started, { now: NOW });
    expect(review).toMatchObject({ minutes: 5, currentIndex: 1 });
    expect(advanceGuidedTrainingSession(review, { now: NOW })).toBeNull();
    expect(sessionStorage.getItem(GUIDED_TRAINING_SESSION_KEY)).toBeNull();
  });

  it('conserva el paso actual en sessionStorage y lo elimina al terminar', () => {
    const plan = buildGuidedTrainingPlan({ minutes: 15, history: [], puzzles: debtPuzzles, rivalry: {} });
    const started = startGuidedTrainingSession(plan, { now: NOW });
    expect(started.currentIndex).toBe(0);
    expect(loadGuidedTrainingSession({ now: NOW })).toMatchObject({ id: started.id, currentIndex: 0, minutes: 15 });

    let session = advanceGuidedTrainingSession(started, { now: NOW });
    expect(session.currentIndex).toBe(1);
    session = advanceGuidedTrainingSession(session, { now: NOW });
    expect(session.currentIndex).toBe(2);
    session = advanceGuidedTrainingSession(session, { now: NOW });
    expect(session).toBeNull();
    expect(sessionStorage.getItem(GUIDED_TRAINING_SESSION_KEY)).toBeNull();
  });

  it('no deja que otra cuenta herede la sesión guiada de la anterior', () => {
    localStorage.setItem('chess-study-auth-username', 'alice');
    const plan = buildGuidedTrainingPlan({ minutes: 15, history: [], puzzles: debtPuzzles, rivalry: {} });
    const started = startGuidedTrainingSession(plan, { now: NOW });
    expect(started.owner).toBe('alice');

    localStorage.setItem('chess-study-auth-username', 'bob');
    expect(loadGuidedTrainingSession({ now: NOW })).toBeNull();
    expect(sessionStorage.getItem(GUIDED_TRAINING_SESSION_KEY)).toBeNull();
  });

  it('descarta sesiones viejas en vez de resucitarlas en otra visita', () => {
    sessionStorage.setItem(GUIDED_TRAINING_SESSION_KEY, JSON.stringify({
      schema: 1,
      id: 'stale',
      owner: null,
      minutes: 15,
      startedAt: NOW - 5 * 60 * 60 * 1000,
      currentIndex: 0,
      steps: [{ id: 'x', title: 'viejo', minutes: 15 }],
    }));
    expect(loadGuidedTrainingSession({ now: NOW })).toBeNull();
    expect(sessionStorage.getItem(GUIDED_TRAINING_SESSION_KEY)).toBeNull();
  });
});
