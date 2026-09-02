import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Board from './Board.jsx';
import GameChat from './GameChat.jsx';
import GlossaryTerm from './GlossaryTerm.jsx';
import Matthias3DOpeningBanter from './Matthias3DOpeningBanter.jsx';
import MatthiasWarRoomPortrait from './MatthiasWarRoomPortrait.jsx';
import MusicPlayer from './MusicPlayer.jsx';
import NotationPanel from './NotationPanel.jsx';
import { CPU_IDENTITY } from '../cpuIdentity.js';
import { formatClock } from '../clock.js';
import { formatLongMove } from '../notation.js';
import { seriesLiveMoment, seriesStatusText } from '../series.js';
import { getUsername } from '../auth.js';
import { matthiasMoodAvatar } from '../matthiasVisuals.js';
import { zenModeSummary } from '../zenMode.js';
import { speakCpuComment } from '../voiceCommentary.js';
import { getBoardRenderer, setBoardRenderer, USER_PREFERENCES_CHANGED_EVENT } from '../userPreferences.js';
import {
  matthiasAngerState,
  matthiasCaptureReaction,
  shouldMatthiasReactToCapture,
} from '../matthiasAnger.js';

const Board3D = lazy(() => import('./Board3D.jsx'));
const WAR_ROOM_MATTHIAS_AVATAR = matthiasMoodAvatar('annoyed');
const MOBILE_FOCUS_QUERY = '(max-width: 820px)';
const FOCUS_BUBBLE_MS = 4200;

const BOARD_BUBBLE_EVENTS = new Set([
  'MATE_FOUND', 'MISSED_MATE', 'STALEMATE_BLUNDER', 'STALEMATE', 'ALLOWED_MATE',
  'PAWN_TAKES_QUEEN', 'QUEEN_CAPTURE', 'QUEEN_SACRIFICE_OFFER', 'PROMOTION',
  'SKEWER', 'DISCOVERED_CHECK', 'KNIGHT_FORK', 'PAWN_FORK', 'ROOK_SACRIFICE_OFFER',
  'QUEEN_EN_PRISE_TO_PAWN', 'PAWN_TAKES_ROOK', 'CHECK',
]);

const CAPTURE_REACTION_SUPPRESSED_EVENTS = new Set([
  'PAWN_TAKES_QUEEN',
  'QUEEN_CAPTURE',
  'PAWN_TAKES_ROOK',
]);

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
  const [boardRenderer, setBoardRendererState] = useState(() => getBoardRenderer());
  const [focusMode, setFocusMode] = useState(false);
  const [compactViewport, setCompactViewport] = useState(() => (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(MOBILE_FOCUS_QUERY).matches
  ));
  const [focusBubble, setFocusBubble] = useState(null);
  const [captureReaction, setCaptureReaction] = useState(null);
  const [portraitReaction, setPortraitReaction] = useState({ key: '', type: 'none' });
  const captureReactionTimeoutRef = useRef(null);
  const focusBubbleTimeoutRef = useRef(null);
  const focusSeenMessageRef = useRef('');
  const captureTrackingRef = useRef({ gameId: null, seenId: null, lastReaction: null });
  const portraitTrackingRef = useRef({ gameId: null, humanId: null, cpuId: null });
  const liveSeriesMoment = context.seriesState ? seriesLiveMoment(context.seriesState) : null;
  const topColor = humanColor === 'w' ? 'b' : 'w';
  const bottomColor = humanColor;
  const topTime = topColor === 'w' ? clocks.whiteTime : clocks.blackTime;
  const bottomTime = bottomColor === 'w' ? clocks.whiteTime : clocks.blackTime;
  const isThreeD = boardRenderer === '3d';
  const focusActive = focusMode && compactViewport;
  const matthiasAnger = useMemo(
    () => matthiasAngerState(game.history || [], humanColor),
    [game.history, humanColor],
  );
  const latestMatthiasMessage = [...(side.gameContextMessages || []), ...(side.gameChat || [])]
    .filter((message) => message?.by === 'cpu' && message?.text)
    .at(-1);
  const latestBoardBubble = [...(side.gameChat || [])]
    .reverse()
    .find((message) => message?.by === 'cpu' && message?.text && BOARD_BUBBLE_EVENTS.has(message?.event));

  if (captureTrackingRef.current.gameId !== game.id) {
    captureTrackingRef.current = {
      gameId: game.id,
      seenId: matthiasAnger.latestHumanCapture?.id || null,
      lastReaction: null,
    };
  }

  if (portraitTrackingRef.current.gameId !== game.id) {
    portraitTrackingRef.current = {
      gameId: game.id,
      humanId: matthiasAnger.latestHumanCapture?.id || null,
      cpuId: matthiasAnger.latestCpuCapture?.id || null,
    };
  }

  const activeMatthiasMessage = captureReaction || latestMatthiasMessage;
  const activeBoardBubble = captureReaction || latestBoardBubble;
  const activeMatthiasKey = activeMatthiasMessage?.id || activeMatthiasMessage?.text || '';

  useEffect(() => {
    const refreshRenderer = () => setBoardRendererState(getBoardRenderer());
    window.addEventListener(USER_PREFERENCES_CHANGED_EVENT, refreshRenderer);
    return () => window.removeEventListener(USER_PREFERENCES_CHANGED_EVENT, refreshRenderer);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia(MOBILE_FOCUS_QUERY);
    const refresh = () => {
      setCompactViewport(media.matches);
      if (!media.matches) setFocusMode(false);
    };
    refresh();
    media.addEventListener?.('change', refresh);
    return () => media.removeEventListener?.('change', refresh);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    document.body.classList.toggle('game-mobile-focus-active', focusActive);
    return () => document.body.classList.remove('game-mobile-focus-active');
  }, [focusActive]);

  useEffect(() => {
    setFocusMode(false);
    setFocusBubble(null);
    focusSeenMessageRef.current = '';
    if (focusBubbleTimeoutRef.current) window.clearTimeout(focusBubbleTimeoutRef.current);
  }, [game.id]);

  useEffect(() => {
    if (!focusActive) {
      if (focusBubbleTimeoutRef.current) window.clearTimeout(focusBubbleTimeoutRef.current);
      setFocusBubble(null);
      return undefined;
    }
    if (!activeMatthiasKey || focusSeenMessageRef.current === activeMatthiasKey) return undefined;

    focusSeenMessageRef.current = activeMatthiasKey;
    setFocusBubble(activeMatthiasMessage);
    if (focusBubbleTimeoutRef.current) window.clearTimeout(focusBubbleTimeoutRef.current);
    focusBubbleTimeoutRef.current = window.setTimeout(() => setFocusBubble(null), FOCUS_BUBBLE_MS);
    return () => {
      if (focusBubbleTimeoutRef.current) window.clearTimeout(focusBubbleTimeoutRef.current);
    };
  }, [focusActive, activeMatthiasKey]);

  useEffect(() => {
    if (captureReactionTimeoutRef.current) window.clearTimeout(captureReactionTimeoutRef.current);
    setCaptureReaction(null);
    setPortraitReaction({ key: '', type: 'none' });
  }, [game.id]);

  useEffect(() => {
    const tracking = portraitTrackingRef.current;
    const humanCapture = matthiasAnger.latestHumanCapture;
    const cpuCapture = matthiasAnger.latestCpuCapture;
    const humanChanged = Boolean(humanCapture?.id && tracking.humanId !== humanCapture.id);
    const cpuChanged = Boolean(cpuCapture?.id && tracking.cpuId !== cpuCapture.id);

    tracking.humanId = humanCapture?.id || null;
    tracking.cpuId = cpuCapture?.id || null;

    if (!isThreeD || zenMode || (!humanChanged && !cpuChanged)) return;

    const candidates = [
      humanChanged ? { capture: humanCapture, type: 'disapprove' } : null,
      cpuChanged ? { capture: cpuCapture, type: 'smirk' } : null,
    ].filter(Boolean).sort((a, b) => Number(b.capture?.ply || 0) - Number(a.capture?.ply || 0));
    const latest = candidates[0];
    if (!latest?.capture?.id) return;

    setPortraitReaction({
      key: `${latest.type}:${game.id}:${latest.capture.id}`,
      type: latest.type,
    });
  }, [
    game.id,
    isThreeD,
    zenMode,
    matthiasAnger.latestHumanCapture?.id,
    matthiasAnger.latestCpuCapture?.id,
  ]);

  useEffect(() => {
    const capture = matthiasAnger.latestHumanCapture;
    const tracking = captureTrackingRef.current;
    if (!capture || tracking.seenId === capture.id) return;

    // En Focus 2D Matthias también puede protestar: Focus es presentación,
    // no una orden de silencio. Fuera de Focus mantenemos esta reacción ligada
    // a War Room para conservar el comportamiento histórico.
    tracking.seenId = capture.id;
    if (zenMode || (!isThreeD && !focusActive)) return;

    const bubblePly = Number(latestBoardBubble?.ply);
    const overlapsExistingNoteworthy = latestBoardBubble?.actor === 'human'
      && CAPTURE_REACTION_SUPPRESSED_EVENTS.has(latestBoardBubble?.event)
      && Number.isFinite(bubblePly)
      && Math.abs(bubblePly - capture.ply) <= 1;
    if (overlapsExistingNoteworthy) return;

    const now = Date.now();
    if (!shouldMatthiasReactToCapture(capture, tracking.lastReaction, now)) return;

    const text = matthiasCaptureReaction(capture.piece, matthiasAnger.level);
    const message = {
      id: `capture-reaction:${game.id}:${capture.id}`,
      by: 'cpu',
      actor: 'human',
      event: 'CAPTURE_REACTION',
      ply: capture.ply,
      text,
    };
    tracking.lastReaction = { at: now, ply: capture.ply, piece: capture.piece };
    setCaptureReaction(message);
    speakCpuComment(text);

    if (captureReactionTimeoutRef.current) window.clearTimeout(captureReactionTimeoutRef.current);
    captureReactionTimeoutRef.current = window.setTimeout(() => setCaptureReaction(null), 4200);
  }, [game.id, isThreeD, focusActive, zenMode, matthiasAnger.latestHumanCapture?.id, matthiasAnger.level, latestBoardBubble?.id]);

  useEffect(() => () => {
    if (captureReactionTimeoutRef.current) window.clearTimeout(captureReactionTimeoutRef.current);
    if (focusBubbleTimeoutRef.current) window.clearTimeout(focusBubbleTimeoutRef.current);
    if (typeof document !== 'undefined') document.body.classList.remove('game-mobile-focus-active');
  }, []);

  function toggleBoardRenderer() {
    const next = setBoardRenderer(boardRenderer === '3d' ? '2d' : '3d');
    setBoardRendererState(next);
  }

  function enterFocus() {
    focusSeenMessageRef.current = activeMatthiasKey;
    setFocusBubble(null);
    setFocusMode(true);
  }

  function exitFocus() {
    setFocusMode(false);
    setFocusBubble(null);
  }

  function renderPlayerRail({ color, seconds, cpu = false }) {
    const isLow = seconds !== null && seconds <= 10;
    const isTicking = clocks.tickingColor === color;
    const active = game.turn === color && !game.isGameOver && !clocks.flagFallen && !clocks.forcedOutcome;
    const railTurnLabel = game.isGameOver || clocks.flagFallen || clocks.forcedOutcome
      ? 'FINAL'
      : cpu
        ? (active ? 'TURNO CPU' : 'ESPERANDO')
        : (game.turn === humanColor ? 'TU TURNO' : 'TURNO CPU');
    return (
      <div className={`game-player-rail ${cpu ? 'is-cpu' : 'is-human'} ${active ? 'is-active' : ''}`} aria-label={`${cpu ? `${CPU_IDENTITY.name}, CPU` : 'Jugador'} ${railTurnLabel.toLowerCase()}`}>
        <span className={`game-player-avatar${cpu ? ' has-portrait' : ''}`} aria-hidden="true">{cpu ? <img src={CPU_IDENTITY.avatar} alt="" /> : '♙'}</span>
        <span className="game-player-identity">
          <strong>{cpu ? CPU_IDENTITY.name : (getUsername() || 'Tú')}</strong>
          <small>{cpu
            ? `${CPU_IDENTITY.role} · nivel ${game.difficulty}${Number(rivalryRecord.games || 0) > 0 ? ` · duelo ${Number(rivalryRecord.wins || 0)}V ${Number(rivalryRecord.draws || 0)}T ${Number(rivalryRecord.losses || 0)}D` : ''}`
            : (color === 'w' ? 'Blancas' : 'Negras')}
          </small>
        </span>
        {clocks.hasClock ? (
          <span className={`clock-chip ${isTicking ? 'ticking' : ''} ${isLow ? 'low' : ''}`} title={railTurnLabel}>{formatClock(seconds ?? 0)}</span>
        ) : (
          <span className="game-player-turn">{railTurnLabel}</span>
        )}
      </div>
    );
  }

  const boardProps = {
    fen: board.visibleBoardFen,
    onSquareClick: board.onSquareClick,
    selectedSquare: board.selected,
    legalTargets: zenMode ? [] : board.legalTargets,
    lastMove: zenMode ? null : board.lastMoveSquares,
    animate: board.pendingAnim,
    hintMove: zenMode ? null : board.hint,
    checkSquare: zenMode ? null : board.kingInCheckSquare,
    gameOver: Boolean(game.isGameOver || clocks.flagFallen || clocks.forcedOutcome),
    turnState: board.boardTurnState,
    orientation: humanColor === 'b' ? 'black' : 'white',
    showCoordinates: !zenMode && board.showBoardCoordinates,
    matthiasKingColor: topColor,
    onCustomize: board.onCustomize,
  };

  return (
    <div className={`game-layout${isThreeD ? ' game-layout-3d' : ''}${focusActive ? ' game-layout-focus' : ''}`} data-mobile-focus={focusActive ? 'true' : 'false'}>
      <div className="board-column">
        <div className={`status-line ${status.statusClass} ${!zenMode && status.turnBanner && !status.busy ? 'pulse' : ''}`} role="status" aria-label="Estado de la partida" aria-live="polite">
          {status.statusText}
        </div>
        {!zenMode && !focusActive && status.audienceReaction && <div className="audience-reaction"><span>Grada anónima</span><b>{status.audienceReaction}</b></div>}
        {!zenMode && !focusActive && status.matthiasSilentBeat && <div className="matthias-silent-beat" role="status" aria-label="Matthias observa en silencio"><img src={CPU_IDENTITY.avatar} alt="" aria-hidden="true" /><span>Matthias</span><b>…</b></div>}
        {!focusActive && context.memoryContext.suddenDeath && <div className="sudden-strip">Sudden Death · vidas: {'♥'.repeat(Math.max(0,context.suddenLives))}{'♡'.repeat(Math.max(0,3-context.suddenLives))}</div>}
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
        <div className={`board-live-row ${zenMode ? 'zen-mode' : ''}${isThreeD ? ' is-3d-warroom' : ''}`}>
          {!zenMode && !focusActive && isThreeD && (
            <aside className="game-3d-command-column" aria-label="Puesto táctico de Matthias">
              <div className="game-3d-matthias-card">
                <MatthiasWarRoomPortrait
                  avatar={WAR_ROOM_MATTHIAS_AVATAR}
                  speechKey={activeMatthiasMessage?.id || activeMatthiasMessage?.text || ''}
                  speechText={activeMatthiasMessage?.text || ''}
                  angerLevel={matthiasAnger.level}
                  reactionKey={portraitReaction.key}
                  reactionType={portraitReaction.type}
                />
                <div className="game-3d-matthias-copy">
                  <span>COMANDANTE RIVAL</span>
                  <h2>{CPU_IDENTITY.name}</h2>
                  <p>{CPU_IDENTITY.role} · nivel {game.difficulty}</p>
                  {Number(rivalryRecord.games || 0) > 0 && (
                    <small>{Number(rivalryRecord.wins || 0)}V · {Number(rivalryRecord.draws || 0)}T · {Number(rivalryRecord.losses || 0)}D contra ti</small>
                  )}
                </div>
              </div>

              <div className="game-3d-warroom-message" aria-live="polite">
                <span>ÚLTIMA OBSERVACIÓN</span>
                <p>{activeMatthiasMessage?.text || 'Silencio táctico. Matthias todavía no ha considerado necesario abrir la boca.'}</p>
              </div>

              <div className="game-3d-warroom-status">
                <span>SITUACIÓN</span>
                <strong>{status.statusText}</strong>
              </div>

              <div className="game-3d-warroom-controls" aria-label="Controles de vista 3D">
                <button type="button" className="secondary-btn is-selected" aria-pressed="true">3D</button>
                <button type="button" className="secondary-btn" onClick={toggleBoardRenderer}>2D</button>
                {board.onCustomize && <button type="button" className="secondary-btn" onClick={board.onCustomize}>Apariencia</button>}
              </div>

              <blockquote>«Nací peón. Siempre seré peón.»</blockquote>
            </aside>
          )}

          <div className={`game-board-stack${isThreeD ? ' game-board-stack-3d' : ''}`}>
            {!focusActive && !isThreeD && renderPlayerRail({ color: topColor, seconds: topTime, cpu: true })}
            {isThreeD ? (
              <Suspense fallback={<div className="hint-text">Preparando sala 3D…</div>}>
                <Board3D {...boardProps} />
              </Suspense>
            ) : <Board {...boardProps} />}
            <Matthias3DOpeningBanter
              gameId={game.id}
              isThreeD={isThreeD}
              historyLength={game.history.length}
              enabled={!zenMode}
            />
            {!zenMode && !focusActive && activeBoardBubble && (
              <aside key={activeBoardBubble.id} className="matthias-board-bubble" role="status" aria-label="Comentario de Matthias sobre el tablero">
                <span>MATTHIAS</span>
                <p>{activeBoardBubble.text}</p>
              </aside>
            )}
            {!zenMode && focusActive && focusBubble && (
              <aside key={focusBubble.id || focusBubble.text} className="matthias-board-bubble game-mobile-focus-bubble" role="status" aria-label="Comentario de Matthias en Focus">
                <span>MATTHIAS</span>
                <p>{focusBubble.text}</p>
              </aside>
            )}
            {!zenMode && !focusActive && board.selectionNotice && (
              <div className={`move-availability-note ${board.selectionNotice.kind}`} role="status" aria-live="polite">
                <b>{board.selectionNotice.kind === 'pinned' ? <>Pieza <GlossaryTerm term="Clavada">clavada</GlossaryTerm></> : 'Sin jugadas legales'}</b>
                <span>{board.selectionNotice.text}</span>
              </div>
            )}
            {!focusActive && renderPlayerRail({ color: bottomColor, seconds: bottomTime, cpu: false })}
            {!focusActive && (
              <div className="game-command-deck" aria-label="Mesa de controles de la partida">
                <div className="game-controls" aria-label="Controles principales de la partida">
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
                      className={`secondary-btn board-renderer-toggle ${isThreeD ? 'active' : ''}`}
                      aria-pressed={isThreeD}
                      title={isThreeD ? 'Volver al tablero 2D' : 'Usar tablero 3D con cámara fija'}
                      onClick={toggleBoardRenderer}
                    >
                      {isThreeD ? 'Vista · 3D' : 'Vista · 2D'}
                    </button>
                    <button
                      type="button"
                      className={`secondary-btn zen-mode-toggle ${zenMode ? 'active' : ''}`}
                      aria-pressed={zenMode}
                      title={zenModeSummary(zenMode)}
                      onClick={controls.onToggleZen}
                    >
                      {zenMode ? 'Zen · ON' : 'Zen · OFF'}
                    </button>
                    {compactViewport && (
                      <button type="button" className="secondary-btn game-mobile-focus-toggle" onClick={enterFocus}>
                        Focus
                      </button>
                    )}
                    <button className="secondary-btn game-abandon-btn" onClick={controls.onAbandon}>Abandonar partida</button>
                  </div>
                </div>
              </div>
            )}
            {focusActive && (
              <button type="button" className="game-mobile-focus-exit" onClick={exitFocus} aria-label="Salir del modo Focus">
                Salir de Focus
              </button>
            )}
          </div>
          {!zenMode && !focusActive && <aside className={`game-side-column${isThreeD ? ' game-side-column-3d' : ''}`} aria-label="Chat de partida">
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
        {!zenMode && !focusActive && board.hint && <p className="hint-caption">Pista: {formatLongMove(board.hint)}</p>}
        {!zenMode && !focusActive && controls.captureFeedback && <p className="capture-feedback">{controls.captureFeedback}</p>}
        {!zenMode && !focusActive && controls.hintMode === 'paid' && (
          <p className="hint-caption hint-balance">Puntos disponibles: {controls.points}</p>
        )}
      </div>
    </div>
  );
}