import { useMemo } from 'react';
import { loadPersonalPuzzles } from '../personalPuzzles.js';
import { personalTrainingDebtSummary } from '../trainingDebt.js';
import './InsightsRecurrentErrors.css';

export function buildRecurrentErrorEvidence(puzzles = []) {
  return personalTrainingDebtSummary(puzzles);
}

export default function InsightsRecurrentErrors({ onOpenPuzzles }) {
  const summary = useMemo(() => buildRecurrentErrorEvidence(loadPersonalPuzzles()), []);

  return (
    <section className="insights-recurrent-errors" aria-label="Reincidencias demostradas">
      <div className="insights-recurrent-errors__heading">
        <div>
          <span className="section-label">Evidencia real</span>
          <h2>Reincidencias demostradas</h2>
        </div>
        {summary.debts.length > 0 && (
          <small>{summary.activeCount} activa{summary.activeCount === 1 ? '' : 's'} · {summary.paidCount} pagada{summary.paidCount === 1 ? '' : 's'}</small>
        )}
      </div>

      {summary.active.length > 0 ? (
        <div className="insights-recurrent-errors__list">
          {summary.active.slice(0, 4).map((debt) => (
            <article key={debt.id} className="insights-recurrent-errors__card">
              <div>
                <strong>{debt.label}</strong>
                <small>{debt.cases} casos reales · corrección limpia {debt.progress}/{debt.target}</small>
              </div>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => onOpenPuzzles?.('personal', false, { incidentKey: debt.incidentKey, label: debt.label })}
              >
                Entrenar →
              </button>
            </article>
          ))}
        </div>
      ) : summary.paidCount > 0 ? (
        <p className="hint-text insights-recurrent-errors__empty">✓ No tienes deuda recurrente pendiente. {summary.paidCount} patrón{summary.paidCount === 1 ? '' : 'es'} demostrado{summary.paidCount === 1 ? '' : 's'} ya está{summary.paidCount === 1 ? '' : 'n'} corregido{summary.paidCount === 1 ? '' : 's'} con dos casos distintos.</p>
      ) : (
        <p className="hint-text insights-recurrent-errors__empty">Todavía no hay una reincidencia demostrada. Un error aislado no se convierte en “debilidad” porque Matthias tenga ganas de insultarte.</p>
      )}

      {summary.paidCount > 0 && summary.activeCount > 0 && (
        <details className="friendly-disclosure">
          <summary>Patrones ya corregidos ({summary.paidCount})</summary>
          <div className="friendly-disclosure-body insights-recurrent-errors__paid">
            {summary.paid.map((debt) => <span key={debt.id}>✓ {debt.label} · {debt.cases} casos reales · {debt.progress}/{debt.target} limpios</span>)}
          </div>
        </details>
      )}
    </section>
  );
}
