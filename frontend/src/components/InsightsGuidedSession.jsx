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

function actionLabel(step) {
  if (step?.action === 'nemesis-position') return 'Abrir posición Némesis →';
  if (step?.action === 'short-game') return 'Abrir partida de práctica →';
  if (step?.action === 'personal-filter') return 'Entrenar esta deuda →';
  if (step?.action === 'personal') return 'Abrir Tus crímenes →';
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
    const recommendedMinutes = plans[15].available ? 15 : plans[5].available ? 5 : plans[30].available ? 30 : null;
    const recommendedPlan = recommendedMinutes ? plans[recommendedMinutes] : null;
    const focus = recommendedPlan?.steps?.[0] || null;
    const available = Boolean(recommendedPlan?.available);

    return (
      <section
        className="menu-section insights-guided-session"
        aria-labelledby="guided-session-title"
        data-guided-session-home="desk-task"
      >
        <div className="insights-guided-session-intro">
          <span className="section-label">Nota de Matthias</span>
          <h2 id="guided-session-title">Tu siguiente tarea</h2>
          <p className="hint-text">Una prioridad, elegida sólo a partir de evidencia guardada. El tiempo y el expediente completo quedan en segundo plano.</p>
        </div>

        {available ? (
          <div className="insights-guided-focus">
            <div>
              <small>Recomendación · {recommendedMinutes} min</small>
              <h3>{focus?.title || 'Sesión personal'}</h3>
              <p>{focus?.detail || 'Matthias ha preparado un recorrido con tu material de entrenamiento disponible.'}</p>
            </div>
            <button
              type="button"
              className="primary-btn"
              aria-label={`Empezar sesión recomendada de ${recommendedMinutes} min`}
              onClick={() => begin(recommendedMinutes)}
            >
              Empezar · {recommendedMinutes} min →
            </button>
          </div>
        ) : (
          <p className="hint-text">{plans[5].reason || plans[15].reason || plans[30].reason}</p>
        )}

        {available ? (
          <details className="friendly-disclosure insights-duration-disclosure">
            <summary>Cambiar tiempo</summary>
            <div className="coaching-action insights-duration-picker" role="group" aria-label="Duración de la sesión guiada">
              {[5, 15, 30].map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  className={minutes === recommendedMinutes ? 'primary-btn insights-duration-option insights-duration-option-recommended' : 'secondary-btn insights-duration-option'}
                  aria-label={`Tengo ${minutes} min`}
                  disabled={!plans[minutes].available}
                  onClick={() => begin(minutes)}
                >
                  <strong>{minutes} min</strong>
                  <span>{minutes === 5 ? 'Un foco' : minutes === 15 ? 'Foco + práctica' : 'Sesión completa'}</span>
                </button>
              ))}
              <span className="insights-duration-note">Sólo usa evidencia real de tu expediente y respeta el tiempo elegido.</span>
            </div>
          </details>
        ) : null}

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