import React, { useEffect, useRef, useState } from 'react';
import { nextBestAction } from '../nextBestAction.js';
import { registerCompletedGameForFeedback } from '../postGameFeedback.js';
import { seriesLiveMoment, seriesNextActionLabel } from '../series.js';
import { CPU_IDENTITY } from '../cpuIdentity.js';
import PostGameFeedbackPrompt from './PostGameFeedbackPrompt.jsx';

const GameReportModal = React.lazy(() => import('./GameReportModal.jsx'));

export function canOfferPostGameTraining({ onTrainPersonal, seriesState = null, runState = null } = {}) {
  if (typeof onTrainPersonal !== 'function') return false;
  if (runState?.active) return false;
  if (seriesState && !seriesState.winner) return false;
  return true;
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
  const [showPostGameFeedback, setShowPostGameFeedback] = useState(false);
  const feedbackRegisteredGameRef = useRef(null);
  const finished = Boolean(game.isGameOver || flagFallen || forcedOutcome);

  useEffect(() => {
    setShowReport(false);
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
  const trainingAvailable = canOfferPostGameTraining({ onTrainPersonal, seriesState, runState });

  return <>
    <div className="modal-backdrop endgame-modal-backdrop" role="presentation">
      <section className={`endgame-banner endgame-dialog outcome-${finalOutcome}`} role="dialog" aria-modal="true" aria-labelledby="game-finished-title">
        <span className="endgame-modal-kicker">PARTIDA FINALIZADA</span>
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
        {lastCpuComment && (
          <blockquote className="endgame-cpu-verdict">
            <span>{CPU_IDENTITY.name}</span>
            <p>{lastCpuComment}</p>
          </blockquote>
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
        {!seriesState && !runState?.active && <p className="endgame-next-detail">{nextAction.detail}</p>}
        {(seriesState || runState?.active || nextAction.id === 'review') && <button className="secondary-btn" style={{ marginTop: '0.6rem' }} onClick={onLeave}>Volver al menú</button>}
        {onShareResult && (
          <button className="secondary-btn" style={{ marginTop: '0.6rem' }} onClick={() => onShareResult(finalOutcome)}>
            Compartir resultado
          </button>
        )}
        {trainingAvailable && <button className="secondary-btn" style={{ marginTop: '0.6rem' }} onClick={onTrainPersonal}>Entrenar mis errores</button>}
        {game.history.length > 0 && nextAction.id !== 'review' && (
          <button className="secondary-btn" onClick={() => setShowReport(true)}>
            Resumen de la partida
          </button>
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
          onTrainPersonal={trainingAvailable ? onTrainPersonal : null}
          meta={reportMeta}
          onShareIncident={(moveReport, report) => onShareIncident?.(moveReport, report, finalOutcome)}
          onOpenCrimeScene={(moveReport, report) => onOpenCrimeScene?.(moveReport, report, { outcome: finalOutcome })}
        />
      </React.Suspense>
    )}
  </>;
}
