import { personalSpacedReviewSummary } from '../spacedReview.js';

function reviewDateLabel(value) {
  const date = new Date(value || '');
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(date);
}

export default function PersonalTrainingDebtPanel({ summary, puzzles = [], onTrain }) {
  const debts = Array.isArray(summary?.debts) ? summary.debts : [];
  const top = summary?.top || null;
  const spaced = personalSpacedReviewSummary(puzzles);
  const nextReviewLabel = reviewDateLabel(spaced.nextAt);
  if (!debts.length && spaced.dueCount === 0 && spaced.upcomingCount === 0) return null;

  function train(debt) {
    if (!debt?.puzzleIds?.length) return;
    const candidates = debt.puzzleIds
      .map((id) => puzzles.find((puzzle) => puzzle?.id === id))
      .filter(Boolean)
      .sort((a, b) => Number(a.cleanSolves || 0) - Number(b.cleanSolves || 0) || Number(a.attempts || 0) - Number(b.attempts || 0));
    onTrain?.(candidates[0] || null, debt);
  }

  function review(entry) {
    if (!entry?.puzzle) return;
    onTrain?.(entry.puzzle, {
      id: `spaced-review:${entry.puzzle.id}`,
      kind: 'spaced-review',
      stage: entry.state.stage,
      intervalDays: entry.state.intervalDays,
    });
  }

  const debtBlock = !debts.length ? null : !top ? (
    <p className="hint-text friendly-inline-note" role="status">
      ✓ Deuda recurrente pagada: {summary.paidCount} patrón{summary.paidCount === 1 ? '' : 'es'} demostrado{summary.paidCount === 1 ? '' : 's'} ya tienen dos casos distintos resueltos limpiamente.
    </p>
  ) : (
    <section className="friendly-inline-note personal-training-debt" aria-label="Deuda de errores recurrentes">
      <span className="eyebrow">NO VUELVAS A HACER ESTO</span>
      <p><b>{top.label}</b></p>
      <p className="hint-text">{top.cases} casos reales · {top.progress}/{top.target} casos resueltos limpiamente.</p>
      <button type="button" className="secondary-btn" onClick={() => train(top)}>Entrenar esta deuda →</button>

      {debts.length > 1 && (
        <details className="friendly-disclosure">
          <summary>Ver todas las deudas ({summary.activeCount} activas · {summary.paidCount} pagadas)</summary>
          <div className="friendly-disclosure-body personal-puzzle-history-list">
            {debts.map((debt) => (
              <div className="personal-puzzle-history-row" key={debt.id}>
                <span>
                  <b>{debt.label}</b>
                  <small>{debt.cases} casos reales · {debt.progress}/{debt.target} limpios{debt.paid ? ' · pagada' : ''}</small>
                </span>
                {debt.active ? <button type="button" className="secondary-btn" onClick={() => train(debt)}>Entrenar →</button> : <span>✓</span>}
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );

  return (
    <>
      {spaced.dueCount > 0 ? (
        <section className="friendly-inline-note personal-training-debt" aria-label="Repaso espaciado 3 7 21">
          <span className="eyebrow">REPASO 3 / 7 / 21</span>
          <p><b>{spaced.dueCount} caso{spaced.dueCount === 1 ? '' : 's'} ya toca{spaced.dueCount === 1 ? '' : 'n'}.</b></p>
          <p className="hint-text">
            Vuelven sólo errores de autopsias reales que ya resolviste limpiamente. Si recaes, esa evidencia deja de contar y la deuda del patrón puede reabrirse.
          </p>
          <button type="button" className="secondary-btn" onClick={() => review(spaced.due[0])}>
            Repasar ahora · fase {spaced.due[0].state.stage + 1}/3 →
          </button>
          {spaced.dueCount > 1 && (
            <details className="friendly-disclosure">
              <summary>Ver cola de repaso ({spaced.dueCount})</summary>
              <div className="friendly-disclosure-body personal-puzzle-history-list">
                {spaced.due.map((entry) => (
                  <div className="personal-puzzle-history-row" key={entry.puzzle.id}>
                    <span>
                      <b>{entry.puzzle.title || 'Caso personal'}</b>
                      <small>Fase {entry.state.stage + 1}/3 · intervalo {entry.state.intervalDays} días{entry.puzzle.opening ? ` · ${entry.puzzle.opening}` : ''}</small>
                    </span>
                    <button type="button" className="secondary-btn" onClick={() => review(entry)}>Repasar →</button>
                  </div>
                ))}
              </div>
            </details>
          )}
        </section>
      ) : spaced.upcomingCount > 0 ? (
        <p className="hint-text friendly-inline-note" role="status">
          ✓ Repaso 3/7/21 al día{nextReviewLabel ? ` · próximo caso ${nextReviewLabel}` : ''}. No hacemos volver posiciones antes de tiempo sólo para fabricar trabajo.
        </p>
      ) : null}
      {debtBlock}
    </>
  );
}
