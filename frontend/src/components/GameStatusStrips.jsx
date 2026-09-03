import { CPU_IDENTITY } from '../cpuIdentity.js';
import { seriesLiveMoment, seriesStatusText } from '../series.js';

export default function GameStatusStrips({ game, zenMode, focusActive, status, context }) {
  const liveSeriesMoment = context.seriesState ? seriesLiveMoment(context.seriesState) : null;

  return (
    <>
      <div className={`status-line ${status.statusClass} ${!zenMode && status.turnBanner && !status.busy ? 'pulse' : ''}`} role="status" aria-label="Estado de la partida" aria-live="polite">
        {status.statusText}
      </div>
      {!zenMode && !focusActive && status.audienceReaction && <div className="audience-reaction"><span>Grada anónima</span><b>{status.audienceReaction}</b></div>}
      {!zenMode && !focusActive && status.matthiasSilentBeat && <div className="matthias-silent-beat" role="status" aria-label="Matthias observa en silencio"><img src={CPU_IDENTITY.avatar} alt="" aria-hidden="true" /><span>Matthias</span><b>…</b></div>}
      {!focusActive && context.memoryContext.suddenDeath && <div className="sudden-strip">Sudden Death · vidas: {'♥'.repeat(Math.max(0, context.suddenLives))}{'♡'.repeat(Math.max(0, 3 - context.suddenLives))}</div>}
      {context.controlPrompt && <div className="control-check-strip"><b>Control táctico</b><span>{context.controlPrompt}</span><button className="secondary-btn" onClick={context.onContinueControl}>Ya lo he mirado · que siga</button></div>}
      {!zenMode && !focusActive && context.memoryContext.nemesis && <div className="series-strip nemesis-strip">Némesis · {context.memoryContext.nemesisLabel || 'posición de tu historial'} · entrenamiento sin afectar al rating</div>}
      {!zenMode && !focusActive && game.ghostStyle && <div className="series-strip ghost-strip">Modo Rival Fantasma · nivel {game.difficulty} · estilo derivado de tus partidas</div>}
      {!zenMode && !focusActive && context.seriesState && (
        <div className={`series-strip series-live-strip ${context.seriesState.winner ? 'finished' : ''}`}>
          <span>{seriesStatusText(context.seriesState)}</span>
          {liveSeriesMoment?.label && <strong>{liveSeriesMoment.label}</strong>}
        </div>
      )}
      {!zenMode && !focusActive && context.runState?.active && <div className="series-strip">{context.runState.mode === 'boss' ? `Boss Run · fase ${context.runState.stage + 1}/6 · CPU ${context.runState.difficulty}` : context.runState.mode === 'cup' ? `Copa · ${context.runState.completedStages || 0}/8 · ${context.runState.points || 0} pts · CPU ${context.runState.difficulty}` : `Racha · ${context.runState.wins} victorias · CPU ${context.runState.difficulty}`}</div>}
      {!zenMode && !focusActive && context.achievementToast && (
        <div className={`achievement-toast ${context.achievementToast.kind === 'shame' ? 'shame' : 'glory'}`}>
          <b>{context.achievementToast.kind === 'shame' ? '☠ Trofeo de vergüenza' : '🏆 Logro desbloqueado'}</b>
          <span>{context.achievementToast.name}</span>
        </div>
      )}
    </>
  );
}
