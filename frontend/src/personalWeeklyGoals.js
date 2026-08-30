import { loadCleanGameRecords } from './cleanGames.js';
import { loadPersonalPuzzles } from './personalPuzzles.js';
import { personalTrainingDebtSummary } from './trainingDebt.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const GOAL_PRIORITY = Object.freeze({ debt: 0, 'clean-games': 1, 'personal-puzzles': 2 });

function timestamp(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampProgress(value, target) {
  return Math.max(0, Math.min(target, Math.floor(Number(value) || 0)));
}

function cleanGamesGoal(records, now) {
  const rows = Object.values(records || {}).filter((row) => row?.version === 1 && row.sufficientSample === true);
  if (!rows.length) return null;
  const cutoff = now - WEEK_MS;
  const cleanThisWeek = rows.filter((row) => row.clean === true && timestamp(row.date) >= cutoff && timestamp(row.date) <= now).length;
  const target = 2;
  return {
    id: 'clean-games-week',
    kind: 'clean-games',
    title: 'Demuestra 2 partidas limpias',
    detail: 'Sólo cuentan autopsias con muestra suficiente y sin mistakes/blunders graves, mate omitido ni regalo severo de material.',
    progress: clampProgress(cleanThisWeek, target),
    target,
    done: cleanThisWeek >= target,
    action: null,
    actionLabel: null,
  };
}

function debtGoal(puzzles) {
  const debt = personalTrainingDebtSummary(puzzles).top;
  if (!debt) return null;
  return {
    id: `debt:${debt.incidentKey}`,
    kind: 'debt',
    title: `Paga la deuda: ${debt.label}`,
    detail: `${debt.cases} casos reales respaldan el patrón. La deuda se cierra con ${debt.target} posiciones distintas resueltas limpiamente.`,
    progress: clampProgress(debt.progress, debt.target),
    target: debt.target,
    done: debt.paid,
    action: 'personal-filter',
    actionLabel: 'Entrenar esta deuda →',
    filter: { incidentKey: debt.incidentKey },
  };
}

function personalPuzzleGoal(puzzles, now) {
  const source = Array.isArray(puzzles) ? puzzles : [];
  if (!source.length) return null;
  const cutoff = now - WEEK_MS;
  const solvedThisWeek = source.filter((puzzle) => {
    const at = timestamp(puzzle.masteredAt);
    return Number(puzzle.cleanSolves || 0) > 0 && at >= cutoff && at <= now;
  }).length;
  const pending = source.filter((puzzle) => !puzzle.masteredAt && Number(puzzle.cleanSolves || 0) <= 0).length;
  if (pending === 0) return null;
  const target = 3;
  return {
    id: 'personal-puzzles-week',
    kind: 'personal-puzzles',
    title: 'Resuelve 3 crímenes personales',
    detail: `${pending} ${pending === 1 ? 'posición pendiente' : 'posiciones pendientes'} ahora mismo. Sólo suma una resolución limpia registrada esta semana.`,
    progress: clampProgress(solvedThisWeek, target),
    target,
    done: solvedThisWeek >= target,
    action: 'personal',
    actionLabel: 'Abrir Tus crímenes →',
    filter: null,
  };
}

export function buildPersonalWeeklyGoals({
  puzzles = loadPersonalPuzzles(),
  cleanRecords = loadCleanGameRecords(),
  now = Date.now(),
} = {}) {
  const safeNow = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const candidates = [
    debtGoal(puzzles),
    cleanGamesGoal(cleanRecords, safeNow),
    personalPuzzleGoal(puzzles, safeNow),
  ].filter(Boolean);

  return candidates
    .sort((a, b) => (
      Number(a.done) - Number(b.done)
      || (GOAL_PRIORITY[a.kind] ?? 99) - (GOAL_PRIORITY[b.kind] ?? 99)
      || (a.progress / a.target) - (b.progress / b.target)
      || a.id.localeCompare(b.id)
    ))
    .slice(0, 3);
}

export { WEEK_MS as PERSONAL_WEEKLY_GOAL_WINDOW_MS };
