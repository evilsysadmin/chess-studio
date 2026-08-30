import { useMemo } from 'react';
import { loadPersonalPuzzles } from '../personalPuzzles.js';
import { loadRivalry } from '../rivalry.js';
import { personalTrainingDebtSummary, trainingDebtFilter, trainingIncidentLabel } from '../trainingDebt.js';
import './InsightsErrorsPanel.css';

const TRACKED_INCIDENTS = new Set([
  'human:MISSED_MATE',
  'human:ALLOWED_MATE',
  'human:QUEEN_EN_PRISE_TO_PAWN',
  'human:STALEMATE_BLUNDER',
  'cpu:PAWN_TAKES_QUEEN',
  'cpu:KNIGHT_FORK',
  'cpu:PAWN_FORK',
]);

export function buildInsightsErrorsModel(puzzles = [], rivalry = {}) {
  const debt = personalTrainingDebtSummary(puzzles);
  const incidents = Object.entries(rivalry?.incidents || {})
    .filter(([key, count]) => TRACKED_INCIDENTS.has(key) && Number(count) > 0)
    .map(([key, count]) => ({ key, label: trainingIncidentLabel(key), count: Number(count) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return { debt, incidents };
}

export default function InsightsErrorsPanel({ onOpenPuzzles }) {
  const model = useMemo(() => buildInsightsErrorsModel(loadPersonalPuzzles(), loadRivalry()), []);
  const { debt, incidents } = model;

  return (
    <section className="insights-errors-evidence" aria-label="Errores recurrentes demostrados">
      <div className="insights-errors-evidence-heading">
        <div>
          <span className="section-label">Evidencia, no sermón</span>
          <h2>Lo que estás repitiendo</h2>
        </div>
        <span className="insights-errors-evidence-count">{debt.activeCount} deuda{debt.activeCount === 1 ? '' : 's'} activa{debt.activeCount === 1 ? '' : 's'}</span>
      </div>

      {debt.active.length > 0 ? (
        <div className="training-debt-list">
          {debt.active.slice(0, 4).map((item) => (
            <article className="training-debt-card" key={item.id}>
              <div>
                <strong>{item.label}</strong>
                <small>{item.cases} casos reales · {item.distinctGames} partida{item.distinctGames === 1 ? '' : 's'} · corrección limpia {item.progress}/{item.target}</small>
              </div>
              <button
                type="button"
                className="primary-btn"
                onClick={() => onOpenPuzzles?.('personal', false, trainingDebtFilter(item))}
              >
                Entrenar esta deuda →
              </button>
            </article>
          ))}
        </div>
      ) : (
        <p className="hint-text insights-errors-clean-note">No hay una reincidencia autobiográfica demostrada pendiente. Un incidente aislado no se convierte en “debilidad” por arte de magia.</p>
      )}

      {incidents.length > 0 && (
        <details className="friendly-disclosure insights-errors-incidents">
          <summary>Registro de incidentes ({incidents.length})</summary>
          <div className="friendly-disclosure-body insights-errors-incident-list">
            {incidents.slice(0, 7).map((item) => (
              <div className="insights-errors-incident-row" key={item.key}>
                <span>{item.label}</span>
                <b>{item.count}</b>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
