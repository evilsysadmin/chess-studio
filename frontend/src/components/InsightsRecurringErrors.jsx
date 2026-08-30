import { loadPersonalPuzzles } from '../personalPuzzles.js';
import { buildRecurringErrorPatterns } from '../insightsRecurringErrors.js';
import './InsightsRecurringErrors.css';

export default function InsightsRecurringErrors({ onOpenPuzzles }) {
  const patterns = buildRecurringErrorPatterns(loadPersonalPuzzles());

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
          {patterns.map((pattern) => (
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
          ))}
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
