export default function PersonalTrainingDebtPanel({ summary, puzzles = [], onTrain }) {
  const debts = Array.isArray(summary?.debts) ? summary.debts : [];
  const top = summary?.top || null;
  if (!debts.length) return null;

  function train(debt) {
    if (!debt?.puzzleIds?.length) return;
    const candidates = debt.puzzleIds
      .map((id) => puzzles.find((puzzle) => puzzle?.id === id))
      .filter(Boolean)
      .sort((a, b) => Number(a.cleanSolves || 0) - Number(b.cleanSolves || 0) || Number(a.attempts || 0) - Number(b.attempts || 0));
    onTrain?.(candidates[0] || null, debt);
  }

  if (!top) {
    return (
      <p className="hint-text friendly-inline-note" role="status">
        ✓ Deuda recurrente pagada: {summary.paidCount} patrón{summary.paidCount === 1 ? '' : 'es'} demostrado{summary.paidCount === 1 ? '' : 's'} ya tienen dos casos distintos resueltos limpiamente.
      </p>
    );
  }

  return (
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
}
