import { buildPersonalWeeklyGoals } from '../personalWeeklyGoals.js';

export default function InsightsWeeklyGoals({ onOpenPuzzles }) {
  const goals = buildPersonalWeeklyGoals();
  if (!goals.length) return null;

  function runGoal(goal) {
    if (!onOpenPuzzles || !goal?.action) return;
    if (goal.action === 'personal-filter') {
      onOpenPuzzles('personal', false, goal.filter || null);
      return;
    }
    if (goal.action === 'personal') onOpenPuzzles('personal', false);
  }

  return (
    <section className="menu-section insights-weekly-goals" aria-labelledby="weekly-goals-title">
      <div className="insights-recurring-errors-heading">
        <div>
          <span className="section-label">Esta semana</span>
          <h2 id="weekly-goals-title">Objetivos personales</h2>
          <p className="hint-text">Hasta tres objetivos derivados de tus autopsias y posiciones guardadas. No hay XP decorativa ni misiones inventadas para rellenar.</p>
        </div>
        <strong>{goals.filter((goal) => goal.done).length}/{goals.length}</strong>
      </div>
      <div className="insights-recurring-errors-grid">
        {goals.map((goal) => (
          <article className="insights-recurring-error-card" key={goal.id} data-weekly-goal={goal.kind} data-goal-done={goal.done ? 'true' : 'false'}>
            <div className="insights-recurring-error-topline">
              <strong>{goal.done ? '✓ ' : ''}{goal.title}</strong>
              <span>{goal.progress}/{goal.target}</span>
            </div>
            <p>{goal.detail}</p>
            <div className="insights-recurring-error-footer">
              <small>{goal.done ? 'Objetivo demostrado con datos reales.' : `Faltan ${Math.max(0, goal.target - goal.progress)}.`}</small>
              {!goal.done && goal.action && onOpenPuzzles ? (
                <button type="button" className="primary-btn" onClick={() => runGoal(goal)}>{goal.actionLabel}</button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
