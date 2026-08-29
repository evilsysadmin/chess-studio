import { STORAGE_LOCAL, getStorageItem } from './safeStorage.js';
import { setProfileStorageItem } from './profileKeys.js';

export const ONBOARDING_INSIGHTS_KEY = 'chess-study-onboarding-insights-seen-v1';

// Una cuenta nueva debe ver un camino claro, no métricas vacías ni datos de
// otra persona. El historial de actividad es la fuente más fiable porque se
// registra al comenzar la primera partida, incluso antes de que termine.
export function isFreshAccount({ activity = [], tournament = {} } = {}) {
  const hasPlayed = Array.isArray(activity) && activity.some((event) => event?.state === 'started' || event?.state === 'finished');
  const tournamentProgress = Number(tournament?.progressPoints || tournament?.points || 0);
  // Combat entrega créditos iniciales a todo recluta. No son progreso y no
  // deben esconder la bienvenida de una cuenta recién creada.
  return !hasPlayed && tournamentProgress <= 0;
}

export function onboardingInsightsSeen() {
  return getStorageItem(STORAGE_LOCAL, ONBOARDING_INSIGHTS_KEY) === '1';
}

export function markOnboardingInsightsSeen() {
  setProfileStorageItem(ONBOARDING_INSIGHTS_KEY, '1');
}

export function buildHomeOnboarding({ activity = [], puzzlesSolved = 0, insightsSeen = false, schoolStarted = false } = {}) {
  const finishedGame = Array.isArray(activity) && activity.some((event) => event?.state === 'finished');
  const solvedPuzzle = Number(puzzlesSolved) > 0;
  const reviewedInsights = Boolean(insightsSeen);
  const steps = [
    { id: 'school', label: 'Entra en la Escuela de Matthias', detail: 'Haz una lección hands-on en tablero y aprende cómo funciona el curso.', done: Boolean(schoolStarted) },
    { id: 'game', label: 'Juega una partida', detail: 'Torneo elige rival y puede proponerte un Reto opcional.', done: finishedGame },
    { id: 'puzzle', label: 'Resuelve un puzzle', detail: 'Prueba una táctica corta.', done: solvedPuzzle },
    { id: 'insights', label: 'Mira Así juegas', detail: 'Convierte tus partidas en una siguiente acción.', done: reviewedInsights },
  ];
  const next = steps.find((step) => !step.done)?.id || null;
  return { steps, next, complete: next === null, completed: steps.filter((step) => step.done).length };
}
