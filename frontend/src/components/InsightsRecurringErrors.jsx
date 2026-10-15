import { useState } from 'react';
import { loadCleanGameRecords } from '../cleanGames.js';
import { patternProgressCopy } from '../factualLanguage.js';
import { focusPersonalPuzzle, loadPersonalPuzzles } from '../personalPuzzles.js';
import { buildPlayerModel, PATTERN_IMPROVEMENT_STATES } from '../playerModel.js';
import { selectRecurringPatternExample } from '../insightsRecurringErrors.js';
import InsightsPositionAutopsy from './InsightsPositionAutopsy.jsx';
import './InsightsRecurringErrors.css';

// An index into Player Model facts, not another diagnosis or puzzle provider.
export default function InsightsRecurringErrors({
  onOpenPuzzles,
  playerModel: sharedPlayerModel = null,
  personalPuzzles: sharedPuzzles = null,
}) {
  const puzzles = sharedPuzzles || loadPersonalPuzzles();
  const playerModel = sharedPlayerModel || buildPlayerModel({
    personalPuzzles: puzzles,
    cleanGameRecords: loadCleanGameRecords(),
  });
  const patterns = playerModel.recurringErrors;
  const [selectedKey, setSelectedKey] = useState(null);
  const selected = patterns.find((item) => item.incidentKey === selectedKey) || patterns[0] || null;
  const example = selected ? selectRecurringPatternExample(selected, puzzles) : null;
  const canTrain = Boolean(example && selected?.pending > 0 && onOpenPuzzles);

  function trainPattern() {
    if (!canTrain) return;
    // PuzzleScreen consumes the one-time focus, so the displayed case is first.
    if (example?.id) focusPersonalPuzzle(example.id);
    onOpenPuzzles('personal', false, selected.filter);
  }

  return (
    <section className="menu-section insights-recurring-errors insights-blackbook" aria-labelledby="insights-recurring-errors-title">
      <div className="insights-recurring-errors-heading">
        <div>
          <span className="section-label">El libro negro de Matthias</span>
          <h2 id="insights-recurring-errors-title">No vuelvas a hacer esto</h2>
          <p className="hint-text">Reincidencias respaldadas por al menos dos posiciones personales. El expediente enseña hechos, no sospechas.</p>
        </div>
        {patterns.length > 0 ? <strong>{patterns.length} {patterns.length === 1 ? 'patrón' : 'patrones'}</strong> : null}
      </div>
      {selected ? (
        <div className="insights-blackbook-layout">
          <div className="insights-blackbook-index" role="group" aria-label="Índice de reincidencias">
            {patterns.map((pattern) => {
              const progress = patternProgressCopy(pattern);
              const active = pattern.incidentKey === selected.incidentKey;
              return (
                <button
                  type="button"
                  key={pattern.incidentKey}
                  className={'insights-blackbook-entry' + (active ? ' is-current' : '')}
                  aria-pressed={active}
                  aria-controls="insights-blackbook-case"
                  onClick={() => setSelectedKey(pattern.incidentKey)}
                >
                  <span className="insights-recurring-error-topline">
                    <strong>{pattern.label}</strong>
                    <span>{pattern.positions}×</span>
                  </span>
                  <span className="insights-blackbook-evidence">
                    {pattern.positions} {pattern.positions === 1 ? 'posición real' : 'posiciones reales'}
                    {pattern.sourceGames > 0 ? ' · ' + pattern.sourceGames + (pattern.sourceGames === 1 ? ' partida fuente' : ' partidas fuente') : ''}
                    {pattern.maxLoss > 0 ? ' · peor pérdida ~' + pattern.maxLoss + ' cp' : ''}
                  </span>
                  {progress ? (
                    <span
                      className="insights-blackbook-progress"
                      data-training-debt={pattern.debt?.paid ? 'paid' : 'active'}
                      data-improvement-state={pattern.improvementState || PATTERN_IMPROVEMENT_STATES.NO_SAMPLE}
                    >{progress}</span>
                  ) : null}
                  <span className="insights-blackbook-entry-tail">{active ? 'Expediente abierto' : 'Examinar expediente'} <span aria-hidden="true">→</span></span>
                </button>
              );
            })}
          </div>
          <article id="insights-blackbook-case" className="insights-blackbook-case" role="region" aria-label="Expediente del patrón seleccionado" data-pattern-key={selected.incidentKey}>
            <div className="insights-blackbook-case-heading">
              <span className="section-label">Prueba del expediente</span>
              <h3>Caso documentado</h3>
              <p>{selected.pending > 0
                ? selected.pending + (selected.pending === 1 ? ' posición pendiente.' : ' posiciones pendientes.')
                : 'Sin posiciones pendientes de este patrón.'}</p>
            </div>
            {example ? (
              <div className="insights-blackbook-study">
                <figure className="insights-blackbook-position">
                  <InsightsPositionAutopsy key={example.id || example.fen} puzzle={example} fen={example.fen} />
                  <figcaption>Posición guardada de tu historial · respuesta oculta hasta abrir la autopsia</figcaption>
                </figure>
                <div className="insights-blackbook-action">
                  <p>Este tablero muestra un caso real de tus partidas. La autopsia solo aparece si es posible reconstruir la jugada y la alternativa.</p>
                  {canTrain ? (
                    <button type="button" className="primary-btn" onClick={trainPattern}>Entrenar este patrón →</button>
                  ) : (
                    <p className="hint-text">No hay entrenamiento pendiente acreditado para este caso.</p>
                  )}
                  <details className="insights-blackbook-data">
                    <summary>Ver datos del patrón</summary>
                    <p>{selected.positions} casos registrados; {selected.sourceGames} partidas fuente identificadas.</p>
                    {selected.maxLoss > 0 ? <p>Mayor pérdida registrada: aproximadamente {selected.maxLoss} centipeones.</p> : null}
                    <p>Resolver el ejercicio no demuestra por sí solo que el error haya desaparecido de tus partidas.</p>
                  </details>
                </div>
              </div>
            ) : (
              <div className="insights-blackbook-missing" role="status">
                No se conserva una posición jugable para mostrar este patrón. No se inventarán posiciones ni ejercicios.
              </div>
            )}
          </article>
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
