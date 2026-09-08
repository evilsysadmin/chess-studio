import { lazy, Suspense, useCallback, useRef, useState } from 'react';
import Board from './Board.jsx';
import GameCommandDeck from './GameCommandDeck.jsx';
import GamePlayerRail from './GamePlayerRail.jsx';
import GameSideColumn from './GameSideColumn.jsx';
import GameStatusStrips from './GameStatusStrips.jsx';
import GameWarRoomCommandColumn from './GameWarRoomCommandColumn.jsx';
import GlossaryTerm from './GlossaryTerm.jsx';
import Matthias3DOpeningBanter from './Matthias3DOpeningBanter.jsx';
import WarRoomHansFireCall from './WarRoomHansFireCall.jsx';
import WarRoomHansMopDialogue from './WarRoomHansMopDialogue.jsx';
import WarRoomHansServiceDialogue from './WarRoomHansServiceDialogue.jsx';
import useGameBoardRenderer from './useGameBoardRenderer.js';
import { useGameFocusBubble, useGameMobileFocus } from './useGameMobileFocus.js';
import useMatthias3DBubbleAnchor from './useMatthias3DBubbleAnchor.js';
import useMatthiasBoardReactions from './useMatthiasBoardReactions.js';
import { warRoomHansEventForGame } from './WarRoomHansEventContract.js';
import { shouldForceHansQuickIteration } from './WarRoomHansIteration.js';
import { resolveHansFireOpeningLatch } from './WarRoomHansFireCallContract.js';
import { hasWarRoomHansAppearedForGame } from './WarRoomHansPerGame.js';
import { formatLongMove } from '../notation.js';
import './Matthias3DBubbleAnchor.css';

const Board3D = lazy(() => import('./Board3D.jsx'));

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
  const topColor = humanColor === 'w' ? 'b' : 'w';
  const bottomColor = humanColor;
  const { isThreeD, toggleBoardRenderer } = useGameBoardRenderer();
  const {
    compactViewport,
    focusActive,
    enterFocus: activateFocus,
    exitFocus: deactivateFocus,
  } = useGameMobileFocus(game.id);
  const {
    activeBoardBubble,
    activeMatthiasKey,
    activeMatthiasMessage,
    matthiasAnger,
    portraitReaction,
  } = useMatthiasBoardReactions({
    game,
    humanColor,
    zenMode,
    isThreeD,
    focusActive,
    gameChat: side.gameChat,
    gameContextMessages: side.gameContextMessages,
  });
  const {
    focusBubble,
    markCurrentMessageSeen,
    clearFocusBubble,
  } = useGameFocusBubble({
    gameId: game.id,
    focusActive,
    activeMessage: activeMatthiasMessage,
    activeMessageKey: activeMatthiasKey,
  });
  const boardOrientation = humanColor === 'b' ? 'black' : 'white';
  const {
    stageRef: matthias3DStageRef,
    bubbleStyle: matthias3DBubbleStyle,
    trackedSquare: matthias3DTrackedSquare,
  } = useMatthias3DBubbleAnchor({
    fen: board.visibleBoardFen,
    matthiasKingColor: topColor,
    orientation: boardOrientation,
    enabled: Boolean(isThreeD && !zenMode && !focusActive),
  });

  function enterFocus() {
    markCurrentMessageSeen(activeMatthiasKey);
    activateFocus();
  }

  function exitFocus() {
    deactivateFocus();
    clearFocusBubble();
  }

  const hansEvent = warRoomHansEventForGame(game.id);
  const hansFireplaceEligible = shouldForceHansQuickIteration({
    hintMode: controls.hintMode,
    memoryContext: context.memoryContext,
  });
  // Exactly one Hans event is selected per game. Only the fire event makes the
  // hearth start cold and arms the opening fireplace/cotilleo sequence.
  const hansFireplaceIteration = hansFireplaceEligible && hansEvent === 'fire';
  const hansOpeningRef = useRef({ gameId: null, enabled: false });
  if (hansOpeningRef.current.gameId !== game.id) {
    hansOpeningRef.current = resolveHansFireOpeningLatch(hansOpeningRef.current, {
      gameId: game.id,
      eligible: hansFireplaceIteration,
      historyLength: game.history.length,
      alreadySeen: hasWarRoomHansAppearedForGame(game.id),
    });
  }
  const hansFireCallEnabled = hansOpeningRef.current.enabled && hansFireplaceIteration;
  const [hansFinishedGameId, setHansFinishedGameId] = useState('');
  const hansFireSequenceComplete = hansFinishedGameId === game.id;
  const handleHansFireCallComplete = useCallback(() => {
    setHansFinishedGameId(game.id);
  }, [game.id]);

  const boardProps = {
    gameId: game.id,
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
    orientation: boardOrientation,
    showCoordinates: !zenMode && board.showBoardCoordinates,
    matthiasKingColor: topColor,
    onCustomize: board.onCustomize,
    hansFireplaceIteration,
    hansFireCallEnabled: !zenMode && !focusActive && hansFireCallEnabled,
  };

  return (
    <div className={`game-layout${isThreeD ? ' game-layout-3d' : ''}${focusActive ? ' game-layout-focus' : ''}`} data-mobile-focus={focusActive ? 'true' : 'false'}>
      <div className="board-column">
        <GameStatusStrips
          game={game}
          zenMode={zenMode}
          focusActive={focusActive}
          status={status}
          context={context}
        />

        <div className={`board-live-row ${zenMode ? 'zen-mode' : ''}${isThreeD ? ' is-3d-warroom' : ''}`}>
          {!zenMode && !focusActive && isThreeD && (
            <GameWarRoomCommandColumn
              game={game}
              rivalryRecord={rivalryRecord}
              status={status}
              board={board}
              side={side}
              compactViewport={compactViewport}
              activeMatthiasMessage={activeMatthiasMessage}
              matthiasAnger={matthiasAnger}
              portraitReaction={portraitReaction}
              onToggleBoardRenderer={toggleBoardRenderer}
            />
          )}

          <div className={`game-board-stack${isThreeD ? ' game-board-stack-3d' : ''}`}>
            {!focusActive && !isThreeD && (
              <GamePlayerRail
                game={game}
                humanColor={humanColor}
                rivalryRecord={rivalryRecord}
                clocks={clocks}
                color={topColor}
                cpu
              />
            )}

            {isThreeD ? (
              <div ref={matthias3DStageRef} className="game-board-3d-stage">
                <Suspense fallback={<div className="hint-text">Preparando sala 3D…</div>}>
                  <Board3D {...boardProps} />
                </Suspense>
                {!zenMode && !focusActive && activeBoardBubble && matthias3DBubbleStyle && (
                  <aside
                    key={activeBoardBubble.id}
                    className="matthias-board-bubble matthias-board-bubble-tracked"
                    style={matthias3DBubbleStyle}
                    data-matthias-square={matthias3DTrackedSquare || ''}
                    role="status"
                    aria-label="Comentario de Matthias sobre el tablero"
                  >
                    <span>MATTHIAS</span>
                    <p>{activeBoardBubble.text}</p>
                  </aside>
                )}
              </div>
            ) : <Board {...boardProps} />}

            <Matthias3DOpeningBanter
              gameId={game.id}
              isThreeD={isThreeD}
              historyLength={hansFireCallEnabled ? 0 : game.history.length}
              enabled={!zenMode && !focusActive && (!hansFireCallEnabled || hansFireSequenceComplete)}
              anchorStyle={matthias3DBubbleStyle}
              trackedSquare={matthias3DTrackedSquare}
              leadIn={hansFireCallEnabled ? 'AH, SÍ!' : ''}
            />

            <WarRoomHansFireCall
              gameId={game.id}
              fen={board.visibleBoardFen}
              isThreeD={isThreeD}
              enabled={!zenMode && !focusActive && hansFireCallEnabled}
              matthiasAnchorStyle={matthias3DBubbleStyle}
              matthiasTrackedSquare={matthias3DTrackedSquare}
              onComplete={handleHansFireCallComplete}
            />

            <WarRoomHansMopDialogue
              isThreeD={isThreeD}
              enabled={!zenMode && !focusActive && hansEvent === 'mop'}
              matthiasAnchorStyle={matthias3DBubbleStyle}
              matthiasTrackedSquare={matthias3DTrackedSquare}
            />

            <WarRoomHansServiceDialogue
              isThreeD={isThreeD}
              enabled={!zenMode && !focusActive && hansEvent === 'espresso'}
              matthiasAnchorStyle={matthias3DBubbleStyle}
              matthiasTrackedSquare={matthias3DTrackedSquare}
            />

            {!isThreeD && !zenMode && !focusActive && activeBoardBubble && (
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

            {!focusActive && (
              <GamePlayerRail
                game={game}
                humanColor={humanColor}
                rivalryRecord={rivalryRecord}
                clocks={clocks}
                color={bottomColor}
              />
            )}

            {!focusActive && (
              <GameCommandDeck
                game={game}
                zenMode={zenMode}
                controls={controls}
                isThreeD={isThreeD}
                compactViewport={compactViewport}
                onToggleBoardRenderer={toggleBoardRenderer}
                onEnterFocus={enterFocus}
              />
            )}

            {focusActive && (
              <button type="button" className="game-mobile-focus-exit" onClick={exitFocus} aria-label="Salir del modo Focus">
                Salir de Focus
              </button>
            )}
          </div>

          {!zenMode && !focusActive && (
            <GameSideColumn game={game} side={side} isThreeD={isThreeD} compactViewport={compactViewport} />
          )}
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
