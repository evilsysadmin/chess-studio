import Board from './Board.jsx';
import GameChat from './GameChat.jsx';
import GlossaryTerm from './GlossaryTerm.jsx';
import MusicPlayer from './MusicPlayer.jsx';
import NotationPanel from './NotationPanel.jsx';
import { CPU_IDENTITY } from '../cpuIdentity.js';
import { formatClock } from '../clock.js';
import { formatLongMove } from '../notation.js';
import { seriesLiveMoment, seriesStatusText } from '../series.js';
import { getUsername } from '../auth.js';
import { zenModeSummary } from '../zenMode.js';

export default function GameBoardView({
  game,
  humanColor,
  rivalryRecord,
  zenMode,
  status,
  context,
  clocks,
  board,
  controls,
  side,
}) {
  const liveSeriesMoment = context.seriesState ? seriesLiveMoment(context.seriesState) : null;
  const topColor = humanColor === 'w' ? 'b' : 'w';
  const bottomColor = humanColor;
  const topTime = topColor === 'w' ? clocks.whiteTime : clocks.blackTime;
  const bottomTime = bottomColor === 'w' ? clocks.whiteTime : clocks.blackTime;

  function renderPlayerRail({ color, seconds, cpu = false }) {
    const isLow = seconds !== null && seconds <= 10;
    const isTicking = clocks.tickingColor === color;
    const active = game.turn === color && !game.isGameOver && !clocks.flagFallen && !clocks.forcedOutcome;
    return (
      <div className={`game-player-rail ${cpu ? 'is-cpu' : 'is-human'} ${active ? 'is-active' : ''}`} aria-label={`${cpu ? `${CPU_IDENTITY.name}, CPU` : 'Jugador'} ${active ? 'en turno' : 'esperando'}`}>
        <span className={`game-player-avatar${cpu ? ' has-portrait' : ''}`} aria-hidden="true">{cpu ? <img src={CPU_IDENTITY.avatar} alt="" /> : '♙'}</span>
        <span className="game-player-identity">
          <strong>{cpu ? CPU_IDENTITY.name : (getUsername() || 'Tú')}</strong>
          <small>{cpu
            ? `${CPU_IDENTITY.role} · nivel ${game.difficulty}${Number(rivalryRecord.games || 0) > 0 ? ` · duelo ${Number(rivalryRecord.wins || 0)}V ${Number(rivalryRecord.draws || 0)}T ${Number(rivalryRecord.losses || 0)}D` : ''}`
            : `${color === 'w' ? 'Blancas' : 'Negras'}${active ? ' · Tu turno' : ''}`}
          </small>
        </span>
        {clocks.hasClock ? (
          <span className={`clock-chip ${isTicking ? 'ticking' : ''} ${isLow ? 'low' : ''}`}>{formatClock(seconds ?? 0)}</span>
        ) : (
          <span className="game-player-turn">{active ? 'EN TURNO' : 'ESPERANDO'}</span>
        )}
      </div>
    );
  }

  return (
    <div className="game-layout">
      <div className="board-column">
        <div className={`status-line ${status.statusClass} ${!zenMode && status.turnBanner && !status.busy ? 'pulse' : ''}`} role="status" aria-label="Estado de la partida" aria-live="polite">
          {status.statusText}
        </div>
        {!zenMode && status.audienceReaction && <div className="audience-reaction"><span>Grada anónima</span><b>{status.audienceReaction}</b></div>}
        {!zenMode && status.matthiasSilentBeat && <div className="matthias-silent-beat" role="status" aria-label="Matthias observa en silencio"><img src={CPU_IDENTITY.avatar} alt="" aria-hidden="true" /><span>Matthias</span><b>…</b></div>}
        {context.memoryContext.suddenDeath && <div className="sudden-strip">Sudden Death · vidas: {'♥'.repeat(Math.max(0,context.suddenLives))}{'♡'.repeat(Math.max(0,3-context.suddenLives))}</div>}
        {context.controlPrompt && <div className="control-check-strip"><b>Control táctico</b><span>{context.controlPrompt}</span><button className="secondary-btn" onClick={context.onContinueControl}>Ya lo he mirado · que siga</button></div>}
        {!zenMode && context.memoryContext.nemesis && <div className="series-strip nemesis-strip">Némesis · {context.memoryContext.nemesisLabel || 'posición de tu historial'} · entrenamiento sin afectar al rating</div>}
        {!zenMode && game.ghostStyle && <div className="series-strip ghost-strip">Modo Rival Fantasma · nivel {game.difficulty} · estilo derivado de tus partidas</div>}
        {!zenMode && context.seriesState && (
          <div className={`series-strip series-live-strip ${context.seriesState.winner ? 'finished' : ''}`}>
            <span>{seriesStatusText(context.seriesState)}</span>
            {liveSeriesMoment?.label && <strong>{liveSeriesMoment.label}</strong>}
          </div>
        )}
        {!zenMode && context.runState?.active && <div className="series-strip">{context.runState.mode === 'boss' ? `Boss Run · fase ${context.runState.stage + 1}/6 · CPU ${context.runState.difficulty}` : context.runState.mode === 'cup' ? `Copa · ${context.runState.completedStages || 0}/8 · ${context.runState.points || 0} pts · CPU ${context.runState.difficulty}` : `Racha · ${context.runState.wins} victorias · CPU ${context.runState.difficulty}`}</div>}
        {!zenMode && context.achievementToast && (
          <div className={`achievement-toast ${context.achievementToast.kind === 'shame' ? 'shame' : 'glory'}`}>
            <b>{context.achievementToast.kind === 'shame' ? '☠ Trofeo de vergüenza' : '🏆 Logro desbloqueado'}</b>
            <span>{context.achievementToast.name}</span>
          </div>
        )}
        <div className={`board-live-row ${zenMode ? 'zen-mode' : ''}`}>
          <div className="game-board-stack">
            {renderPlayerRail({ color: topColor, seconds: topTime, cpu: true })}
            <Board
              fen={board.visibleBoardFen}
              onSquareClick={board.onSquareClick}
              selectedSquare={board.selected}
              legalTargets={zenMode ? [] : board.legalTargets}
              lastMove={zenMode ? null : board.lastMoveSquares}
              animate={board.pendingAnim}
              hintMove={zenMode ? null : board.hint}
              checkSquare={zenMode ? null : board.kingInCheckSquare}
              turnState={board.boardTurnState}
              orientation={humanColor === 'b' ? 'black' : 'white'}
              showCoordinates={!zenMode && board.showBoardCoordinates}
              onCustomize={board.onCustomize}
            />
            {!zenMode && board.selectionNotice && (
              <div className={`move-availability-note ${board.selectionNotice.kind}`} role="status" aria-live="polite">
                <b>{board.selectionNotice.kind === 'pinned' ? <>Pieza <GlossaryTerm term="Clavada">clavada</GlossaryTerm></> : 'Sin jugadas legales'}</b>
                <span>{board.selectionNotice.text}</span>
              </div>
            )}
            {renderPlayerRail({ color: bottomColor, seconds: bottomTime, cpu: false })}
            <div className="game-command-deck" aria-label="Mesa de controles de la partida">
              <div className="game-controls" aria-label="Controles principales de la partida">
                <span className={`game-controls-status ${game.turn === humanColor && !game.isGameOver ? 'is-active' : ''}`}><i aria-hidden="true" />{status.statusText}</span>
                <div className="game-controls-actions">
                  {!zenMode && controls.hintMode !== 'off' && (
                    <button className="secondary-btn" disabled={!controls.canHint} onClick={controls.onHint}>
                      {controls.hintButtonLabel}
                    </button>
                  )}
                  {!zenMode && controls.hintMode === 'free' && (
                    <button className="secondary-btn" disabled={controls.busy || game.history.length === 0} onClick={controls.onUndo}>
                      Deshacer jugada
                    </button>
                  )}
                  <button
                    type="button"
                    className={`secondary-btn zen-mode-toggle ${zenMode ? 'active' : ''}`}
                    aria-pressed={zenMode}
                    title={zenModeSummary(zenMode)}
                    onClick={controls.onToggleZen}
                  >
                    {zenMode ? 'Zen · ON' : 'Zen · OFF'}
                  </button>
                  <button className="secondary-btn game-abandon-btn" onClick={controls.onAbandon}>Abandonar partida</button>
                </div>
              </div>
            </div>
          </div>
          {!zenMode && <aside className="game-side-column" aria-label="Chat de partida">
            <div className="game-side-music" aria-label="Música de la partida">
              <MusicPlayer initiallyCollapsed />
            </div>
            <details className="game-notation-disclosure" open={side.notationOpen} onToggle={(event) => side.onNotationOpenChange(event.currentTarget.open)}>
              <summary>Cuaderno de jugadas · {game.history.length} movimientos</summary>
              <div className="game-notation-row">
                <NotationPanel history={game.history} difficulty={game.difficulty} />
              </div>
            </details>
            <GameChat messages={side.gameChat} contextMessages={side.gameContextMessages} />
          </aside>}
        </div>
        {!zenMode && board.hint && <p className="hint-caption">Pista: {formatLongMove(board.hint)}</p>}
        {!zenMode && controls.captureFeedback && <p className="capture-feedback">{controls.captureFeedback}</p>}
        {!zenMode && controls.hintMode === 'paid' && (
          <p className="hint-caption hint-balance">Puntos disponibles: {controls.points}</p>
        )}
      </div>
    </div>
  );
}
