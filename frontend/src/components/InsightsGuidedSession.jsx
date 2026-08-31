import { useMemo, useState } from 'react';
import {
  advanceGuidedTrainingSession,
  buildGuidedTrainingPlan,
  clearGuidedTrainingSession,
  loadGuidedTrainingSession,
  startGuidedTrainingSession,
} from '../guidedTrainingSession.js';

function actionLabel(step) {
  if (step?.action === 'nemesis-position') return 'Abrir posición Némesis →';
  if (step?.action === 'short-game') return 'Jugar 5+0 de práctica →';
  if (step?.action === 'personal-filter') return 'Entrenar esta deuda →';
  if (step?.action === 'personal') return 'Abrir Tus crímenes →';
  return 'Cerrar sesión';
}

export default function InsightsGuidedSession({
  gameHistory = [],
  onOpenPuzzles,
  onPlayFromHere,
  onStartShortPracticeGame,
}) {
  const [session, setSession] = useState(() => loadGuidedTrainingSession());
  const plans = useMemo(() => ({
    15: buildGuidedTrainingPlan({ minutes: 15, history: gameHistory }),
    30: buildGuidedTrainingPlan({ minutes: 30, history: gameHistory }),
  }), [gameHistory]);

  function begin(minutes) {
    const next = startGuidedTrainingSession(plans[minutes]);
    setSession(next);
  }

  function cancel() {
    clearGuidedTrainingSession();
    setSession(null);
  }

  function nextStep() {
    const next = advanceGuidedTrainingSession(session);
    setSession(next);
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
      const training = step.training;
      if (!training?.fen) return;
      onPlayFromHere?.(training.fen, training.humanColor, training.difficulty, {
        nemesis: true,
        nemesisLabel: `Némesis · ${step.opening}`,
        nemesisOpening: step.opening,
        sourceRecord: training.sourceRecord,
      });
      return;
    }
    if (step.action === 'short-game') {
      onStartShortPracticeGame?.();
      return;
    }
    nextStep();
  }

  if (!session) {
    const available = plans[15].available || plans[30].available;
    return (
      <section className="menu-section insights-guided-session" aria-labelledby="guided-session-title">
        <span className="section-label">Sin buscar por menús</span>
        <h2 id="guided-session-title">Sesión automática</h2>
        <p className="hint-text">Chess Studio compone el recorrido con errores personales y Némesis demostradas, añade una 5+0 de práctica y termina de nuevo aquí. El paso actual sobrevive mientras vas y vuelves entre pantallas.</p>
        {available ? (
          <div className="coaching-action">
            <button type="button" className="primary-btn" disabled={!plans[15].available} onClick={() => begin(15)}>Tengo 15 min</button>
            <button type="button" className="secondary-btn" disabled={!plans[30].available} onClick={() => begin(30)}>Tengo 30 min</button>
            <span>{plans[15].available ? `${plans[15].steps.length} pasos basados en tu expediente real.` : plans[15].reason}</span>
          </div>
        ) : (
          <p className="hint-text">{plans[15].reason}</p>
        )}
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
