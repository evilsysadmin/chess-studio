import React, { useEffect, useRef, useState } from 'react';
import { nextBestAction } from '../nextBestAction.js';
import { registerCompletedGameForFeedback } from '../postGameFeedback.js';
import { seriesLiveMoment, seriesNextActionLabel } from '../series.js';
import { CPU_IDENTITY } from '../cpuIdentity.js';
import PostGameFeedbackPrompt from './PostGameFeedbackPrompt.jsx';
import './WarRoomDebrief.css';

const GameReportModal = React.lazy(() => import('./GameReportModal.jsx'));

function matthiasClosingLine({ finalOutcome, flagFallen, flagFinalOutcome, forcedOutcome, humanColor, lastCpuComment }) {
  if (lastCpuComment) return lastCpuComment;
  if (forcedOutcome) return 'Tres incidentes graves. El modo ha terminado; el expediente, desgraciadamente, no.';
  if (flagFallen) {
    if (flagFinalOutcome === 'draw') return 'El reloj cayó, pero no había material para ejecutar la sentencia. Tablas. Qué manera tan burocrática de sobrevivir.';
    return flagFallen === humanColor
      ? 'El reloj ha firmado la sentencia antes que el tablero. Conviene que la próxima partida no dependa de funcionarios.'
      : 'Ganaste por tiempo. Cuenta. No voy a exigir poesía donde ha bastado un reloj.';
  }
  if (finalOutcome === 'win') return 'Bien. Has ganado. Disfrútalo con moderación; ahora veremos si fue precisión, resistencia o una mezcla indecentemente eficaz de ambas.';
  if (finalOutcome === 'loss') return 'Has perdido. No hace falta decorar el cadáver. La revisión dirá exactamente dónde empezó a torcerse la posición.';
  return 'Tablas. Nadie ha muerto del todo. Eso no significa que el expediente esté limpio.';
}

function reviewPrompt(finalOutcome) {
  if (finalOutcome === 'win') return 'Busca qué decisiones sostuvieron la ventaja y cuál fue tu mejor momento real.';
  if (finalOutcome === 'loss') return 'Localiza el primer punto de inflexión y separa la causa de los daños posteriores.';
  return 'Revisa dónde dejaste de poder exigir más a la posición y si hubo una oportunidad concreta.';
}

export default function PostGameExperience({
  game,
  humanColor,
  statusLabel,
  finalOutcome,
  flagFallen = null,
  flagFinalOutcome = null,
  forcedOutcome = null,
  resultSummary = null,
  lastCpuComment = null,
  seriesState = null,
  runState = null,
  onNextSeriesGame,
  onNextRunGame,
  onLeave,
  onShareResult,
  onTrainPersonal,
  onShareIncident,
  onOpenCrimeScene,
  reportMeta = {},
  postGameFeedbackEnabled = true,
}) {
  const [showReport, setShowReport] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [showPostGameFeedback, setShowPostGameFeedback] = useState(false);
  const feedbackRegisteredGameRef = useRef(null);
  const finished = Boolean(game.isGameOver || flagFallen || forcedOutcome);

  useEffect(() => {
    setShowReport(false);
    setShowMoreActions(false);
    setShowPostGameFeedback(false);
  }, [game.id]);

  useEffect(() => {
    if (!postGameFeedbackEnabled || !finished || !game.id || feedbackRegisteredGameRef.current === game.id) return;
    // Entre partidas de una serie/run no competimos por atención con el CTA principal.
    if ((seriesState && !seriesState.winner) || runState?.active) return;
    feedbackRegisteredGameRef.current = game.id;
    if (registerCompletedGameForFeedback({ gameId: game.id })) setShowPostGameFeedback(true);
  }, [game.id, finished, seriesState?.winner, runState?.active, postGameFeedbackEnabled]);

  if (!finished) return null;

  const nextAction = nextBestAction({
    outcome: finalOutcome,
    moveCount: game.history.length,
    hasReport: game.history.length > 0,
  });
  const liveSeriesMoment = seriesState ? seriesLiveMoment(seriesState) : null;
  const sequenceInProgress = Boolean((seriesState && !seriesState.winner) || runState?.active);
  const hasReport = game.history.length > 0;
  const matthiasVerdict = matthiasClosingLine({
    finalOutcome,
    flagFallen,
    flagFinalOutcome,
    forcedOutcome,
    humanColor,
    lastCpuComment,
  });
  const hasMoreActions = Boolean(
    !sequenceInProgress
    && (
      nextAction.id === 'review'
      || onShareResult
      || onTrainPersonal
    )
  );

  return <>
    <div className="modal-backdrop endgame-modal-backdrop" role="presentation">
      <section className={`endgame-banner endgame-dialog outcome-${finalOutcome}`} role="dialog" aria-modal="true" aria-labelledby="game-finished-title">
        <span className="endgame-modal-kicker">PARTIDA FINALIZADA</span>
        <span className="endgame-debrief-label">MATTHIAS // DEBRIEF</span>
        <span className="endgame-eyebrow">{nextAction.eyebrow}</span>
        <h2 id="game-finished-title">{forcedOutcome ? 'Sudden Death' : flagFallen ? (flagFinalOutcome === 'draw' ? 'Tablas por tiempo' : 'Se acabó el tiempo') : statusLabel}</h2>
        <p>
          {forcedOutcome ? 'Tres incidentes tácticos graves. Derrota del modo Sudden Death; no afecta al rating.' : flagFallen
            ? (flagFinalOutcome === 'draw' ? 'Cayó una bandera, pero el rival no tenía material suficiente para dar mate.' : flagFallen === humanColor ? 'Perdiste por tiempo.' : '¡Ganaste por tiempo!')
            : game.status === 'checkmate'
              ? game.turn === humanColor ? `Ganó ${CPU_IDENTITY.name}.` : '¡Ganaste la partida!'
              : 'La partida terminó en tablas.'}
        </p>
        {resultSummary && (
          <p className="endgame-rating-impact">
            <strong>{resultSummary.ratingApplied ? 'Impacto en rating' : 'Rating sin cambios'}</strong>
            <span>{resultSummary.detail}</span>
          </p>
        )}
        <blockquote className="endgame-cpu-verdict endgame-matthias-verdict">
          <span className="endgame-matthias-identity">
            <img src={CPU_IDENTITY.avatar} alt="" aria-hidden="true" />
            <b>{CPU_IDENTITY.name}</b>
          </span>
          <p>{matthiasVerdict}</p>
        </blockquote>
        {!sequenceInProgress && hasReport && (
          <div className="endgame-editorial-brief">
            <span>QUÉ MIRAR AHORA</span>
            <p>{reviewPrompt(finalOutcome)}</p>
          </div>
        )}
        {seriesState && !seriesState.winner && liveSeriesMoment && (
          <div className={`series-endgame-moment ${liveSeriesMoment.kind}`}>
            <span>{liveSeriesMoment.label}</span>
            <strong>{liveSeriesMoment.headline}</strong>
            <small>{liveSeriesMoment.detail}</small>
          </div>
        )}
        {seriesState && !seriesState.winner && onNextSeriesGame ? (
          <button className="primary-btn" onClick={onNextSeriesGame}>{seriesNextActionLabel(seriesState)}</button>
        ) : runState?.active && onNextRunGame ? (
          <button className="primary-btn" onClick={onNextRunGame}>Siguiente desafío</button>
        ) : nextAction.id === 'review' ? (
          <button className="primary-btn" onClick={() => setShowReport(true)}>{nextAction.label}</button>
        ) : (
          <button className="primary-btn" onClick={onLeave}>{nextAction.label}</button>
        )}
        {!sequenceInProgress && <p className="endgame-next-detail">{nextAction.detail}</p>}
        {!sequenceInProgress && hasReport && nextAction.id !== 'review' && (
          <button className="secondary-btn endgame-review-btn" onClick={() => setShowReport(true)}>
            Resumen de la partida
          </button>
        )}
        {sequenceInProgress && <button className="secondary-btn" style={{ marginTop: '0.6rem' }} onClick={onLeave}>Volver al menú</button>}
        {hasMoreActions && (
          <button
            className="secondary-btn"
            style={{ marginTop: '0.6rem' }}
            type="button"
            aria-expanded={showMoreActions}
            onClick={() => setShowMoreActions((visible) => !visible)}
          >
            {showMoreActions ? 'Ocultar opciones' : 'Más opciones'}
          </button>
        )}
        {showMoreActions && !sequenceInProgress && (
          <div className="endgame-more-actions">
            {nextAction.id === 'review' && <button className="secondary-btn" style={{ marginTop: '0.6rem' }} onClick={onLeave}>Volver al menú</button>}
            {onShareResult && (
              <button className="secondary-btn" style={{ marginTop: '0.6rem' }} onClick={() => onShareResult(finalOutcome)}>
                Compartir resultado
              </button>
            )}
            {onTrainPersonal && <button className="secondary-btn" style={{ marginTop: '0.6rem' }} onClick={onTrainPersonal}>Entrenar mis errores</button>}
          </div>
        )}
        {postGameFeedbackEnabled && showPostGameFeedback && (
          <PostGameFeedbackPrompt onDone={() => setShowPostGameFeedback(false)} />
        )}
      </section>
    </div>

    {showReport && (
      <React.Suspense fallback={<div className="modal-backdrop"><div className="army-card game-autopsy" role="status">Preparando resumen…</div></div>}>
        <GameReportModal
          history={game.history}
          humanColor={humanColor}
          onClose={() => setShowReport(false)}
          meta={reportMeta}
          onTrainPersonal={onTrainPersonal ? () => { setShowReport(false); onTrainPersonal(); } : null}
          onShareIncident={(moveReport, report) => onShareIncident?.(moveReport, report, finalOutcome)}
          onOpenCrimeScene={(moveReport, report) => onOpenCrimeScene?.(moveReport, report, { outcome: finalOutcome })}
        />
      </React.Suspense>
    )}
  </>;
}