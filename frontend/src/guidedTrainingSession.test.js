import { beforeEach, describe, expect, it } from 'vitest';
import {
  GUIDED_TRAINING_SESSION_KEY,
  advanceGuidedTrainingSession,
  buildGuidedTrainingPlan,
  clearGuidedTrainingSession,
  isCurrentGuidedTrainingStep,
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

  it('calibra la práctica con las cinco partidas recientes y el color reciente, no con las antiguas', () => {
    // saveGameRecord unshifts the newest entry; invalid values do not count
    // toward the five-game window or the most recent valid human color.
    const history = [
      { difficulty: null, humanColor: null },
      { difficulty: 85, humanColor: 'b' },
      { difficulty: 75, humanColor: 'w' },
      { difficulty: 70, humanColor: 'w' },
      { difficulty: 65, humanColor: 'w' },
      { difficulty: 55, humanColor: 'w' },
      { difficulty: 10, humanColor: 'w' },
      { difficulty: 15, humanColor: 'w' },
    ];
    const plan = buildGuidedTrainingPlan({ minutes: 15, history, puzzles: debtPuzzles, rivalry: {} });
    expect(plan.steps.find((step) => step.kind === 'short-game')).toMatchObject({
      training: { humanColor: 'b', difficulty: 70 },
    });
  });

  it('no descarta partidas reales a CPU nivel 0 al calibrar práctica reciente', () => {
    const history = [
      { difficulty: null, humanColor: null },
      { difficulty: false, humanColor: 'w' },
      { difficulty: '', humanColor: 'w' },
      { difficulty: 200, humanColor: 'w' },
      { difficulty: 0, humanColor: 'b' },
      { difficulty: '0', humanColor: 'b' },
      { difficulty: 0, humanColor: 'b' },
      { difficulty: 0, humanColor: 'b' },
      { difficulty: 0, humanColor: 'b' },
      { difficulty: 90, humanColor: 'w' },
    ];
    const plan = buildGuidedTrainingPlan({ minutes: 15, history, puzzles: debtPuzzles, rivalry: {} });
    expect(plan.steps.find((step) => step.kind === 'short-game')).toMatchObject({
      training: { humanColor: 'w', difficulty: 5 },
    });
    // With only genuinely missing difficulties, the existing safe fallback
    // remains 50; missing is not the same as an explicit numeric zero.
    const unknown = buildGuidedTrainingPlan({
      minutes: 15, history: history.slice(0, 4), puzzles: debtPuzzles, rivalry: {},
    });
    expect(unknown.steps.find((step) => step.kind === 'short-game').training.difficulty).toBe(50);
  });

  it('pondera el nivel cero junto a rivales recientes de mayor fuerza', () => {
    const plan = buildGuidedTrainingPlan({
      minutes: 15,
      history: [{ difficulty: 0 }, { difficulty: 0 }, { difficulty: 20 }],
      puzzles: debtPuzzles,
      rivalry: {},
    });
    expect(plan.steps.find((step) => step.kind === 'short-game').training.difficulty).toBe(7);
  });

  it('toma la deuda focal del Player Model sin recalcularla en la sesión', () => {
    const plan = buildGuidedTrainingPlan({
      minutes: 15,
      history: [],
      puzzles: [{ id: 'debt-available', incidentKeys: ['human:ALLOWED_MATE'], cleanSolves: 0 }],
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

  it('reactiva entrenamiento cuando el Player Model observa una recaída posterior', () => {
    const plan = buildGuidedTrainingPlan({
      minutes: 5,
      history: [],
      puzzles: [{ id: 'relapse-available', incidentKeys: ['human:MISSED_MATE'], cleanSolves: 0 }],
      rivalry: {},
      playerModel: {
        recurringErrors: [{
          incidentKey: 'human:MISSED_MATE',
          label: 'Mates que dejaste escapar',
          positions: 3,
          filter: { incidentKey: 'human:MISSED_MATE' },
          debt: { progress: 2, target: 2, paid: true, active: false, realCases: 3 },
          improvementState: 'still-occurring',
          postTrainingObservations: { recurrenceGames: 1 },
        }],
        trainingDebt: { top: null },
      },
    });

    expect(plan.available).toBe(true);
    expect(plan.steps[0]).toMatchObject({
      id: 'debt:human:MISSED_MATE',
      kind: 'debt',
      action: 'personal-filter',
      filter: { incidentKey: 'human:MISSED_MATE' },
      minutes: 4,
    });
    expect(plan.steps[0].title).toContain('Recaída detectada');
    expect(plan.steps[0].detail).toContain('reapareció');
    expect(plan.steps[0].detail).toContain('después del entrenamiento');
  });

  it('no resucita un patrón cuando la observación posterior sólo permite mejora probable o corrección suficiente', () => {
    for (const improvementState of ['probable-improvement', 'corrected-with-sufficient-sample']) {
      const plan = buildGuidedTrainingPlan({
        minutes: 15,
        history: [],
        puzzles: [],
        rivalry: {},
        playerModel: {
          recurringErrors: [{
            incidentKey: 'human:MISSED_MATE',
            label: 'Mates que dejaste escapar',
            positions: 3,
            filter: { incidentKey: 'human:MISSED_MATE' },
            debt: { progress: 2, target: 2, paid: true, active: false, realCases: 3 },
            improvementState,
            postTrainingObservations: { recurrenceGames: 0, noRecurrenceGames: 5 },
          }],
          trainingDebt: { top: null },
        },
      });

      expect(plan.available).toBe(false);
      expect(plan.steps).toEqual([]);
    }
  });

  it('no deja que un puzzle viejo pendiente resucite un patrón que el Player Model ya considera mejorando o corregido', () => {
    const puzzles = [
      { id: 'old-pending', source: 'autopsy', incidentKeys: ['cpu:KNIGHT_FORK'], cleanSolves: 0 },
      { id: 'recent-clean-1', source: 'autopsy', incidentKeys: ['cpu:KNIGHT_FORK'], cleanSolves: 1 },
      { id: 'recent-clean-2', source: 'autopsy', incidentKeys: ['cpu:KNIGHT_FORK'], cleanSolves: 1 },
    ];

    for (const improvementState of ['probable-improvement', 'corrected-with-sufficient-sample']) {
      const plan = buildGuidedTrainingPlan({
        minutes: 15,
        history: [],
        puzzles,
        rivalry: {},
        playerModel: {
          recurringErrors: [{
            incidentKey: 'cpu:KNIGHT_FORK',
            positions: 3,
            debt: { progress: 2, target: 2, paid: true, active: false, realCases: 3 },
            improvementState,
          }],
          trainingDebt: { top: null },
        },
      });

      expect(plan.available).toBe(false);
      expect(plan.steps).toEqual([]);
    }
  });

  it('mantiene entrenable un pendiente aislado que el Player Model no ha resuelto', () => {
    const plan = buildGuidedTrainingPlan({
      minutes: 5,
      history: [],
      puzzles: [{ id: 'singleton', source: 'autopsy', incidentKeys: ['human:ALLOWED_MATE'], cleanSolves: 0 }],
      rivalry: {},
      playerModel: {
        recurringErrors: [{
          incidentKey: 'cpu:KNIGHT_FORK',
          positions: 3,
          improvementState: 'corrected-with-sufficient-sample',
          debt: { paid: true, active: false },
        }],
        trainingDebt: { top: null },
      },
    });

    expect(plan.available).toBe(true);
    expect(plan.steps[0]).toMatchObject({
      id: 'personal-errors',
      kind: 'personal-errors',
      minutes: 4,
    });
    expect(plan.steps[0].detail).toContain('1 posición real pendiente');
  });

  it('no propone puzzles que la biblioteca considera ya resueltos, aunque cleanSolves sea cero', () => {
    const plan = buildGuidedTrainingPlan({
      minutes: 5,
      history: [],
      puzzles: [{ id: 'completed', incidentKeys: ['human:MISSED_MATE'], solves: 1, cleanSolves: 0 }],
      rivalry: {},
      playerModel: { recurringErrors: [], trainingDebt: { top: null } },
    });
    expect(plan.available).toBe(false);
    expect(plan.steps).toEqual([]);
  });

  it('no ofrece un filtro de deuda vacío cuando sólo hay puzzles de otro incidente', () => {
    const plan = buildGuidedTrainingPlan({
      minutes: 5,
      history: [],
      puzzles: [{ id: 'other', incidentKeys: ['human:ALLOWED_MATE'], cleanSolves: 0 }],
      rivalry: {},
      playerModel: {
        recurringErrors: [{
          incidentKey: 'human:MISSED_MATE',
          filter: { incidentKey: 'human:MISSED_MATE' },
          improvementState: 'still-occurring',
          debt: { active: true },
        }],
      },
    });
    expect(plan.available).toBe(true);
    expect(plan.steps[0]).toMatchObject({ kind: 'personal-errors', action: 'personal' });
  });

  it('no inventa una sesión por deuda recurrente sin posiciones disponibles', () => {
    const plan = buildGuidedTrainingPlan({
      minutes: 5,
      history: [],
      puzzles: [],
      rivalry: {},
      playerModel: {
        recurringErrors: [{ incidentKey: 'human:MISSED_MATE', improvementState: 'still-occurring' }],
      },
    });
    expect(plan.available).toBe(false);
  });

  it('ignora dificultades ausentes o no numéricas pero incluye el nivel cero real', () => {
    const history = [
      { difficulty: 60 },
      { difficulty: null },
      { difficulty: undefined },
      { difficulty: 0 },
      { difficulty: '' },
      { difficulty: 'sin dato' },
      { difficulty: 80 },
    ];
    const plan = buildGuidedTrainingPlan({ minutes: 15, history, puzzles: debtPuzzles, rivalry: {} });
    const practice = plan.steps.find((step) => step.kind === 'short-game');
    // Real observations are 60, 0 and 80. Missing data do not count.
    expect(practice.training.difficulty).toBe(47);
  });

  it('liga la deuda recurrente a una posición pendiente del mismo incidente', () => {
    const plan = buildGuidedTrainingPlan({
      minutes: 5,
      history: [],
      rivalry: {},
      puzzles: [
        { id: 'wrong-incident', incidentKeys: ['cpu:KNIGHT_FORK'], cleanSolves: 0 },
        { id: 'correct-incident', incidentKeys: ['human:MISSED_MATE'], cleanSolves: 0 },
      ],
      playerModel: {
        recurringErrors: [{
          incidentKey: 'human:MISSED_MATE',
          filter: { incidentKey: 'human:MISSED_MATE' },
          improvementState: 'still-occurring',
          debt: { paid: true, active: false },
        }],
      },
    });
    expect(plan.steps[0]).toMatchObject({
      kind: 'debt',
      action: 'personal-filter',
      featuredPuzzleId: 'correct-incident',
    });
  });

  it('la acción personal destaca el caso entrenable, no un viejo error ya corregido', () => {
    const plan = buildGuidedTrainingPlan({
      minutes: 5,
      history: [],
      rivalry: {},
      puzzles: [
        { id: 'old-paid', incidentKeys: ['cpu:KNIGHT_FORK'], cleanSolves: 0 },
        { id: 'still-actionable', incidentKeys: ['human:ALLOWED_MATE'], cleanSolves: 0 },
      ],
      playerModel: {
        recurringErrors: [{
          incidentKey: 'cpu:KNIGHT_FORK',
          improvementState: 'corrected-with-sufficient-sample',
          debt: { paid: true, active: false },
        }],
      },
    });
    expect(plan.steps[0]).toMatchObject({
      kind: 'personal-errors',
      action: 'personal',
      featuredPuzzleId: 'still-actionable',
    });
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

  it('no inventa identidad ni duración al restaurar un expediente corrupto', () => {
    const plan = buildGuidedTrainingPlan({ minutes: 15, history: [], puzzles: debtPuzzles, rivalry: {} });
    const original = startGuidedTrainingSession(plan, { now: NOW });
    const corruptFields = [
      { id: null }, { id: '' }, { id: '   ' }, { id: 123 },
      { minutes: null }, { minutes: '15' }, { minutes: 7 }, { minutes: undefined },
    ];
    for (const fields of corruptFields) {
      sessionStorage.setItem(GUIDED_TRAINING_SESSION_KEY, JSON.stringify({ ...original, ...fields }));
      expect(loadGuidedTrainingSession({ now: NOW })).toBeNull();
      expect(sessionStorage.getItem(GUIDED_TRAINING_SESSION_KEY)).toBeNull();
    }
    expect(startGuidedTrainingSession({ ...plan, minutes: '15' }, { now: NOW })).toBeNull();
    expect(startGuidedTrainingSession({ ...plan, minutes: 7 }, { now: NOW })).toBeNull();
    const restored = startGuidedTrainingSession(plan, { now: NOW });
    expect(loadGuidedTrainingSession({ now: NOW })).toMatchObject({
      id: restored.id, minutes: 15, steps: restored.steps,
    });
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

  it('descarta snapshots con pasos corruptos antes de que Así juegas los renderice', () => {
    const plan = buildGuidedTrainingPlan({ minutes: 15, history: [], puzzles: debtPuzzles, rivalry: {} });
    const started = startGuidedTrainingSession(plan, { now: NOW });
    const healthy = started.steps[0];
    const brokenSteps = [
      [null],
      [{}],
      [{ ...healthy, title: null }],
      [{ ...healthy, action: 'unknown-action' }],
      [{ ...healthy, minutes: Infinity }],
      [{ ...healthy, minutes: 0 }],
      [{ ...healthy, action: 'short-game', training: null }],
      [{ ...healthy, action: 'nemesis-position', training: { fen: 'invalid', humanColor: 'x', difficulty: 50 } }],
    ];
    for (const steps of brokenSteps) {
      sessionStorage.setItem(GUIDED_TRAINING_SESSION_KEY, JSON.stringify({ ...started, steps }));
      expect(loadGuidedTrainingSession({ now: NOW })).toBeNull();
      expect(sessionStorage.getItem(GUIDED_TRAINING_SESSION_KEY)).toBeNull();
    }
    expect(startGuidedTrainingSession({ ...plan, steps: [null] }, { now: NOW })).toBeNull();
    expect(sessionStorage.getItem(GUIDED_TRAINING_SESSION_KEY)).toBeNull();
  });


  it('rechaza planes que exceden minutos o tienen revisión/descriptores ambiguos, también tras F5', () => {
    const plan = buildGuidedTrainingPlan({ minutes: 15, history: [], puzzles: debtPuzzles, rivalry: {} });
    const started = startGuidedTrainingSession(plan, { now: NOW });
    const healthy = plan.steps;
    const invalidSteps = [
      [{ ...healthy[0], minutes: 15 }, ...healthy.slice(1)],
      [{ ...healthy[0], minutes: 8.5 }, ...healthy.slice(1)],
      [{ ...healthy[0], id: healthy[1].id }, ...healthy.slice(1)],
      [healthy[2], ...healthy.slice(0, 2)],
      healthy.slice(0, 2),
      [healthy[0], { ...healthy[1], minutes: 0 }, healthy[2]],
    ];
    for (const steps of invalidSteps) {
      expect(startGuidedTrainingSession({ ...plan, steps }, { now: NOW })).toBeNull();
      // Starting a bad plan must not overwrite an active legitimate session.
      expect(loadGuidedTrainingSession({ now: NOW })?.id).toBe(started.id);
      sessionStorage.setItem(GUIDED_TRAINING_SESSION_KEY, JSON.stringify({ ...started, steps }));
      expect(loadGuidedTrainingSession({ now: NOW })).toBeNull();
      expect(sessionStorage.getItem(GUIDED_TRAINING_SESSION_KEY)).toBeNull();
      sessionStorage.setItem(GUIDED_TRAINING_SESSION_KEY, JSON.stringify(started));
    }
    expect(loadGuidedTrainingSession({ now: NOW })).toMatchObject({
      id: started.id, minutes: 15, currentIndex: 0,
    });
  });

  it('rechaza índices de progreso corruptos en vez de saltar silenciosamente a otro bloque', () => {
    const plan = buildGuidedTrainingPlan({ minutes: 15, history: [], puzzles: debtPuzzles, rivalry: {} });
    const started = startGuidedTrainingSession(plan, { now: NOW });
    const invalidIndices = [-1, started.steps.length, 1.5, '1', null, undefined, false];
    for (const currentIndex of invalidIndices) {
      sessionStorage.setItem(GUIDED_TRAINING_SESSION_KEY, JSON.stringify({ ...started, currentIndex }));
      expect(loadGuidedTrainingSession({ now: NOW })).toBeNull();
      expect(sessionStorage.getItem(GUIDED_TRAINING_SESSION_KEY)).toBeNull();
      expect(advanceGuidedTrainingSession({ ...started, currentIndex }, { now: NOW })).toBeNull();
    }

    const validSecondStep = { ...started, currentIndex: 1 };
    sessionStorage.setItem(GUIDED_TRAINING_SESSION_KEY, JSON.stringify(validSecondStep));
    expect(loadGuidedTrainingSession({ now: NOW })).toMatchObject({
      id: started.id, currentIndex: 1,
    });
  });

  it('no permite que un clic antiguo salte dos bloques de un expediente', () => {
    const plan = buildGuidedTrainingPlan({ minutes: 15, history: [], puzzles: debtPuzzles, rivalry: {} });
    const started = startGuidedTrainingSession(plan, { now: NOW });
    const second = advanceGuidedTrainingSession(started, { now: NOW });
    expect(second.currentIndex).toBe(1);
    expect(isCurrentGuidedTrainingStep(started, second)).toBe(false);
    expect(advanceGuidedTrainingSession(started, { now: NOW })).toBeNull();
    expect(loadGuidedTrainingSession({ now: NOW })).toMatchObject({ id: started.id, currentIndex: 1 });
    expect(isCurrentGuidedTrainingStep(second, loadGuidedTrainingSession({ now: NOW }))).toBe(true);
  });

  it('no resucita expedientes cancelados ni modifica otro nuevo, ni acredita su cierre', () => {
    const plan = buildGuidedTrainingPlan({ minutes: 5, history: [], puzzles: debtPuzzles, rivalry: {} });
    const started = startGuidedTrainingSession(plan, { now: NOW });
    const finalStep = advanceGuidedTrainingSession(started, { now: NOW });
    expect(finalStep.currentIndex).toBe(finalStep.steps.length - 1);
    clearGuidedTrainingSession();
    expect(advanceGuidedTrainingSession(finalStep, { now: NOW })).toBeNull();
    expect(loadGuidedTrainingSession({ now: NOW })).toBeNull();

    const replacement = startGuidedTrainingSession(plan, { now: NOW + 1 });
    expect(replacement.id).not.toBe(started.id);
    expect(isCurrentGuidedTrainingStep(finalStep, replacement)).toBe(false);
    expect(advanceGuidedTrainingSession(finalStep, { now: NOW + 1 })).toBeNull();
    expect(loadGuidedTrainingSession({ now: NOW + 1 })).toMatchObject({
      id: replacement.id, currentIndex: 0,
    });
    expect(isCurrentGuidedTrainingStep(replacement, loadGuidedTrainingSession({ now: NOW + 1 }))).toBe(true);
  });

  it('distingue reinicios en el mismo milisegundo y no autoriza acciones antiguas', () => {
    const plan = buildGuidedTrainingPlan({ minutes: 5, history: [], puzzles: debtPuzzles, rivalry: {} });
    const oldSession = startGuidedTrainingSession(plan, { now: NOW });
    const replacement = startGuidedTrainingSession(plan, { now: NOW });
    expect(replacement.startedAt).toBe(oldSession.startedAt);
    expect(replacement.minutes).toBe(oldSession.minutes);
    expect(replacement.id).not.toBe(oldSession.id);
    expect(isCurrentGuidedTrainingStep(oldSession, replacement)).toBe(false);
    expect(advanceGuidedTrainingSession(oldSession, { now: NOW })).toBeNull();
    expect(clearGuidedTrainingSession(oldSession, { now: NOW })).toBe(false);
    expect(loadGuidedTrainingSession({ now: NOW })).toMatchObject({
      id: replacement.id, currentIndex: 0,
    });
    expect(advanceGuidedTrainingSession(replacement, { now: NOW })?.currentIndex).toBe(1);
  });

  it('no permite cancelar un bloque que ya ha avanzado, pero sí el bloque actual', () => {
    const plan = buildGuidedTrainingPlan({ minutes: 15, history: [], puzzles: debtPuzzles, rivalry: {} });
    const first = startGuidedTrainingSession(plan, { now: NOW });
    const second = advanceGuidedTrainingSession(first, { now: NOW });
    expect(clearGuidedTrainingSession(first, { now: NOW })).toBe(false);
    expect(loadGuidedTrainingSession({ now: NOW })?.currentIndex).toBe(1);
    expect(clearGuidedTrainingSession(second, { now: NOW })).toBe(true);
    expect(loadGuidedTrainingSession({ now: NOW })).toBeNull();
  });

  it('restaura una sesión legítima al mismo paso tras F5, sin reiniciar el entrenamiento', () => {
    const plan = buildGuidedTrainingPlan({ minutes: 15, history: [], puzzles: debtPuzzles, rivalry: {} });
    const started = startGuidedTrainingSession(plan, { now: NOW });
    const advanced = advanceGuidedTrainingSession(started, { now: NOW });
    const rehydrated = loadGuidedTrainingSession({ now: NOW + 10 * 60 * 1000 });
    expect(rehydrated).toMatchObject({ id: started.id, currentIndex: 1, minutes: 15 });
    expect(rehydrated.steps).toEqual(advanced.steps);
    expect(rehydrated.steps[rehydrated.currentIndex]).toMatchObject({ action: 'short-game' });
    expect(advanceGuidedTrainingSession(rehydrated, { now: NOW + 10 * 60 * 1000 })?.currentIndex).toBe(2);
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
