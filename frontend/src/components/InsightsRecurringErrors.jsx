import { loadCleanGameRecords } from '../cleanGames.js';
import { loadPersonalPuzzles } from '../personalPuzzles.js';
import { buildPlayerModel, PATTERN_IMPROVEMENT_STATES } from '../playerModel.js';
import './InsightsRecurringErrors.css';

function debtCopy(pattern) {
  const debt = pattern?.debt;
  if (!debt) return null;
  if (debt.paid) return `✓ Deuda pagada · últimos ${debt.target}: ${debt.progress}/${debt.target} limpios`;
  return `Deuda activa · últimos ${debt.target}: ${debt.progress}/${debt.target} limpios`;
}

export function patternProgressCopy(pattern) {
  switch (pattern?.improvementState) {
    case PATTERN_IMPROVEMENT_STATES.STILL_OCCURRING:
      return 'Sigue ocurriendo · reapareció después de entrenarlo y aún no hay muestra limpia suficiente.';
    case PATTERN_IMPROVEMENT_STATES.PROBABLE_IMPROVEMENT:
      return 'Mejora probable · varias autopsias completas recientes sin repetir este patrón.';
    case PATTERN_IMPROVEMENT_STATES.CORRECTED_WITH_SUFFICIENT_SAMPLE:
      return '✓ Corregido con muestra suficiente · deuda pagada y una racha sostenida sin recurrencia.';
    default:
      return debtCopy(pattern);
  }
}

export default function InsightsRecurringErrors({ onOpenPuzzles }) {
  const playerModel = buildPlayerModel({
    personalPuzzles: loadPersonalPuzzles(),
    cleanGameRecords: loadCleanGameRecords(),
  });
  const patterns = playerModel.recurringErrors;

  return (
    <section className="menu-section insights-recurring-errors" aria-labelledby="insights-recurring-errors-title">
      <div className="insights-recurring-errors-heading">
        <div>
          <span className="section-label">Reincidencias reales</span>
          <h2 id="insights-recurring-errors-title">No vuelvas a hacer esto</h2>
          <p className="hint-text">Sólo aparecen patrones respaldados por al menos dos posiciones personales guardadas. Nada de diagnosticar por una anécdota.</p>
        </div>
        {patterns.length > 0 ? <strong>{patterns.length} {patterns.length === 1 ? 'patrón' : 'patrones'}</strong> : null}
      </div>

      {patterns.length > 0 ? (
        <div className="insights-recurring-errors-grid">
          {patterns.map((pattern) => {
            const progress = patternProgressCopy(pattern);
            return (
              <article className="insights-recurring-error-card" key={pattern.incidentKey}>
                <div className="insights-recurring-error-topline">
                  <strong>{pattern.label}</strong>
                  <span>{pattern.positions}×</span>
                </div>
                <p>
                  {pattern.positions} {pattern.positions === 1 ? 'posición real' : 'posiciones reales'}
                  {pattern.sourceGames > 0 ? ` · ${pattern.sourceGames} ${pattern.sourceGames === 1 ? 'partida fuente' : 'partidas fuente'}` : ''}
                  {pattern.maxLoss > 0 ? ` · peor pérdida ~${pattern.maxLoss} cp` : ''}
                </p>
                {progress ? (
                  <p
                    className="hint-text"
                    data-training-debt={pattern.debt?.paid ? 'paid' : 'active'}
                    data-improvement-state={pattern.improvementState || PATTERN_IMPROVEMENT_STATES.NO_SAMPLE}
                  >
                    {progress}
                  </p>
                ) : null}
                <div className="insights-recurring-error-footer">
                  <small>{pattern.pending > 0 ? `${pattern.pending} ${pattern.pending === 1 ? 'posición pendiente' : 'posiciones pendientes'}` : 'Sin posiciones pendientes ahora mismo'}</small>
                  {pattern.pending > 0 && onOpenPuzzles ? (
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={() => onOpenPuzzles('personal', false, pattern.filter)}
                    >
                      Entrenar este patrón →
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="insights-recurring-errors-empty">
          <strong>Aún no hay reincidencia demostrada.</strong>
          <p className="hint-text">Cuando el mismo tipo de error aparezca en dos o más posiciones personales, quedará señalado aquí.</p>
        </div>
      )}
    </section>
  );
}
