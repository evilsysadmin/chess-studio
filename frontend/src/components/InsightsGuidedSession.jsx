import { useMemo, useState } from 'react';
import {
  advanceGuidedTrainingSession,
  buildGuidedTrainingPlan,
  clearGuidedTrainingSession,
  loadGuidedTrainingSession,
  startGuidedTrainingSession,
} from '../guidedTrainingSession.js';
import {
  clearGuidedTrainingCompletion,
  loadGuidedTrainingCompletion,
  saveGuidedTrainingCompletion,
} from '../guidedTrainingCompletion.js';
import { focusPersonalPuzzle, isPersonalPuzzleMastered, matchesPersonalPuzzleFilter } from '../personalPuzzles.js';
import InsightsPositionAutopsy from './InsightsPositionAutopsy.jsx';

function actionLabel(step) {
  if (step?.action === 'nemesis-position') return 'Abrir posición Némesis →';
  if (step?.action === 'short-game') return 'Abrir partida de práctica →';
  if (step?.action === 'personal-filter') return 'Entrenar esta deuda →';
  if (step?.action === 'personal') return 'Abrir Acciones inmediatas →';
  return 'Cerrar sesión';
}

export default function InsightsGuidedSession({
  gameHistory = [],
  onOpenPuzzles,
  onPlayFromHere,
  playerModel = null,
  personalPuzzles,
  cleanGameRecords,
}) {
  const [session, setSession] = useState(() => loadGuidedTrainingSession());
  const [completion, setCompletion] = useState(() => loadGuidedTrainingCompletion());
  // A time choice previews a plan; only the single primary CTA starts it.
  const [selectedMinutes, setSelectedMinutes] = useState(5);
  const plans = useMemo(() => ({
    5: buildGuidedTrainingPlan({ minutes: 5, history: gameHistory, playerModel, puzzles: personalPuzzles, cleanGameRecords }),
    15: buildGuidedTrainingPlan({ minutes: 15, history: gameHistory, playerModel, puzzles: personalPuzzles, cleanGameRecords }),
    30: buildGuidedTrainingPlan({ minutes: 30, history: gameHistory, playerModel, puzzles: personalPuzzles, cleanGameRecords }),
  }), [gameHistory, playerModel, personalPuzzles, cleanGameRecords]);

  function begin(minutes) {
    clearGuidedTrainingCompletion();
    setCompletion(null);
    const next = startGuidedTrainingSession(plans[minutes]);
    setSession(next);
  }

  function cancel() {
    clearGuidedTrainingSession();
    setSession(null);
  }

  function nextStep() {
    const finishing = session && session.currentIndex >= session.steps.length - 1;
    const next = advanceGuidedTrainingSession(session);
    setSession(next);
    if (finishing && !next) setCompletion(saveGuidedTrainingCompletion(session));
  }

  function hideCompletion() {
    clearGuidedTrainingCompletion();
    setCompletion(null);
  }

  function openTrainingPosition(step, meta = {}) {
    const training = step?.training;
    if (!training?.fen) return;
    onPlayFromHere?.(training.fen, training.humanColor, training.difficulty, {
      ...meta,
      sourceRecord: training.sourceRecordId ? { id: training.sourceRecordId } : undefined,
    });
  }

  function runStep(step) {
    if (!step) return;
    if (step.action === 'personal-filter') {
      onOpenPuzzles?.('personal', false, step.filter || null);
      return;
    }
    if (step.action === 'personal') {
      onOpenPuzzles?.('personal', false);
      return;
    }
    if (step.action === 'nemesis-position') {
      openTrainingPosition(step, {
        nemesis: true,
        nemesisLabel: `Némesis · ${step.opening}`,
        nemesisOpening: step.opening,
      });
      return;
    }
    if (step.action === 'short-game') {
      openTrainingPosition(step);
      return;
    }
    nextStep();
  }

  if (!session) {
    const recommendedMinutes = plans[5].available ? 5 : plans[15].available ? 15 : plans[30].available ? 30 : null;
    const previewMinutes = plans[selectedMinutes]?.available ? selectedMinutes : recommendedMinutes;
    const previewPlan = previewMinutes ? plans[previewMinutes] : null;
    const focus = previewPlan?.steps?.[0] || null;
    const available = Boolean(previewPlan?.available);
    // Preview only puzzles already admitted by the playable personal bank.
    const personalFocus = focus?.action === 'personal' || focus?.action === 'personal-filter';
    const featuredPuzzle = personalFocus && Array.isArray(personalPuzzles)
      ? personalPuzzles.find((puzzle) => (
        puzzle?.fen && !isPersonalPuzzleMastered(puzzle)
        && Number(puzzle?.cleanSolves || 0) === 0
        && matchesPersonalPuzzleFilter(puzzle, focus?.filter || null)
      ))
      : null;
    const featuredFen = featuredPuzzle?.fen || (focus?.action === 'nemesis-position' ? focus.training?.fen : null);
    const directPracticeAvailable = Boolean(featuredFen);
    const featuredTitle = focus?.title === 'Acciones inmediatas' ? 'Tus posiciones pendientes' : focus?.title;
    const evidenceLabel = focus?.kind === 'debt'
      ? 'Patrón registrado'
      : focus?.kind === 'personal-errors'
        ? 'Posiciones personales'
        : focus?.kind === 'nemesis'
          ? 'Partidas guardadas'
          : 'Plan basado en datos';

    return (
      <section
        className="menu-section insights-guided-session"
        aria-labelledby="guided-session-title"
        data-guided-session-home="desk-task"
      >
        <div className="insights-guided-session-intro">
          <span className="section-label">Matthias · sobre el tablero</span>
          <h2 id="guided-session-title">Tu siguiente tarea</h2>
          <p className="hint-text">Una posición auténtica, una oportunidad de jugarla mejor. Lo demás puede esperar.</p>
          {directPracticeAvailable ? (
            <figure className="insights-guided-position" data-featured-source={featuredPuzzle ? 'personal' : 'nemesis'}>
              <InsightsPositionAutopsy key={featuredPuzzle?.id || featuredFen} puzzle={featuredPuzzle} fen={featuredFen} />
              <figcaption>{featuredPuzzle ? 'De tu archivo personal · sin mostrar la solución' : 'De una partida contra tu Némesis'}</figcaption>
            </figure>
          ) : null}
        </div>

        {available ? (
          <div className="insights-guided-focus" data-training-preview-minutes={previewMinutes}>
            <div className="insights-guided-focus-heading">
              <small>HALLAZGO DE MATTHIAS <span aria-hidden="true">·</span> MATERIAL REAL</small>
              <h3>{featuredTitle || 'Sesión personal'}</h3>
              <p>{focus?.detail || 'Matthias ha preparado un recorrido con tu material de entrenamiento disponible.'}</p>
            </div>
            <div className="insights-guided-focus-meta" aria-label="Datos del plan seleccionado">
              <span>{evidenceLabel}</span>
              <span>{previewPlan.steps.length} {previewPlan.steps.length === 1 ? 'bloque' : 'bloques'} de práctica</span>
            </div>
            {directPracticeAvailable ? (
              <div className="insights-guided-direct">
                <button
                  type="button"
                  className="primary-btn insights-guided-direct-button"
                  aria-label="Entrenar esta posición real ahora"
                  onClick={() => {
                    if (featuredPuzzle?.id) focusPersonalPuzzle(featuredPuzzle.id);
                    runStep(focus);
                  }}
                >
                  Entrenar esta posición <span aria-hidden="true">→</span>
                </button>
                <p>Te llevamos al tablero con esta misma posición. Sin cronómetro ni trámites.</p>
              </div>
            ) : null}
            <div className="insights-guided-focus-actions">
              <div className="insights-duration-quick" role="group" aria-label="Cambiar tiempo">
                <span>O elige un recorrido guiado</span>
                {[5, 15, 30].map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    className={minutes === previewMinutes ? 'primary-btn insights-duration-chip' : 'secondary-btn insights-duration-chip'}
                    aria-label={`Tengo ${minutes} min`}
                    aria-pressed={minutes === previewMinutes}
                    disabled={!plans[minutes].available}
                    onClick={() => setSelectedMinutes(minutes)}
                  >
                    {minutes} min
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="primary-btn insights-guided-start"
                aria-label={`Empezar sesión recomendada de ${previewMinutes} min`}
                onClick={() => begin(previewMinutes)}
              >
                Empezar · {previewMinutes} min →
              </button>
            </div>
            <details className="insights-guided-preview-details">
              <summary>Ver el recorrido de {previewMinutes} min</summary>
              <ol>
                {previewPlan.steps.map((step) => (
                  <li key={step.id}>
                    <span>{step.title}</span>
                    <small>~{step.minutes} min</small>
                  </li>
                ))}
              </ol>
              <p>Basado en el material disponible. Terminar los pasos no demuestra por sí solo una mejora.</p>
            </details>
          </div>
        ) : (
          <div className="insights-guided-empty" role="status">
            <strong>El expediente aún no tiene un encargo verificable.</strong>
            <p>{plans[5].reason || plans[15].reason || plans[30].reason}</p>
            <p>Juega partidas o practica con posiciones reales y vuelve cuando haya material suficiente.</p>
          </div>
        )}

        {completion ? (
          <details className="friendly-disclosure insights-guided-completion">
            <summary>Última sesión · {completion.minutes} min</summary>
            <p>Marcaste como hechos {completion.blocks.length} {completion.blocks.length === 1 ? 'bloque' : 'bloques'} de práctica. Esto resume tu recorrido; no afirma que hayas mejorado.</p>
            <ol>
              {completion.blocks.map((block) => (
                <li key={block.id}><b>{block.title}</b>{block.minutes > 0 ? ` · ~${block.minutes} min` : ''}</li>
              ))}
            </ol>
            <div className="coaching-action">
              <button type="button" className="secondary-btn" onClick={hideCompletion}>Ocultar resumen</button>
            </div>
          </details>
        ) : null}
      </section>
    );
  }

  const current = session.steps[session.currentIndex];
  const isLast = session.currentIndex >= session.steps.length - 1;
  return (
    <section className="menu-section insights-guided-session active" aria-labelledby="guided-session-title">
      <div className="insights-recurring-errors-heading">
        <div>
          <span className="section-label">Sesión guiada · {session.minutes} min</span>
          <h2 id="guided-session-title">Hoy toca esto</h2>
          <p className="hint-text">Paso {session.currentIndex + 1}/{session.steps.length}. “Hecho” sólo mueve el recorrido; no concede progreso ni afirma que hayas mejorado.</p>
        </div>
        <strong>{session.steps.reduce((sum, step) => sum + Number(step.minutes || 0), 0)} min</strong>
      </div>

      <div className="insights-recurring-error-card">
        <div className="insights-recurring-error-topline">
          <strong>{current.title}</strong>
          <span>~{current.minutes} min</span>
        </div>
        <p>{current.detail}</p>
        <div className="insights-recurring-error-footer">
          <small>{isLast ? 'Último paso: cierra aquí y deja que los datos futuros digan si sirvió.' : 'Haz este bloque y vuelve aquí para pasar al siguiente.'}</small>
          <div className="coaching-action">
            <button type="button" className="primary-btn" onClick={() => runStep(current)}>{actionLabel(current)}</button>
            {!isLast ? <button type="button" className="secondary-btn" onClick={nextStep}>Hecho · siguiente →</button> : null}
            <button type="button" className="secondary-btn" onClick={cancel}>Cancelar sesión</button>
          </div>
        </div>
      </div>

      <details className="friendly-disclosure">
        <summary>Ver recorrido completo</summary>
        <ol>
          {session.steps.map((step, index) => (
            <li key={step.id}><b>{index === session.currentIndex ? '→ ' : ''}{step.title}</b> · ~{step.minutes} min</li>
          ))}
        </ol>
      </details>
    </section>
  );
}