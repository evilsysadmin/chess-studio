import { lazy, memo, Suspense } from 'react';
import Board from './Board.jsx';

const Board3D = lazy(() => import('./Board3D.jsx'));

function sameLegalTargets(a = [], b = []) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((target, index) => target?.to === b[index]?.to && target?.san === b[index]?.san);
}

export function sameBoardSurfaceProps(previous, next) {
  if (previous.isThreeD !== next.isThreeD) return false;
  if (previous.loadingLabel !== next.loadingLabel) return false;
  if (previous.loadingClassName !== next.loadingClassName) return false;
  const a = previous.boardProps;
  const b = next.boardProps;
  if (a === b) return true;
  if (!a || !b) return false;
  return a.gameId === b.gameId
    && a.fen === b.fen
    && a.onSquareClick === b.onSquareClick
    && a.selectedSquare === b.selectedSquare
    && sameLegalTargets(a.legalTargets, b.legalTargets)
    && a.lastMove === b.lastMove
    && a.animate === b.animate
    && a.hintMove === b.hintMove
    && a.checkSquare === b.checkSquare
    && a.gameOver === b.gameOver
    && a.turnState === b.turnState
    && a.orientation === b.orientation
    && a.showCoordinates === b.showCoordinates
    && a.matthiasKingColor === b.matthiasKingColor
    && a.onCustomize === b.onCustomize
    && a.hansFireplaceIteration === b.hansFireplaceIteration
    && a.hansFireCallEnabled === b.hansFireCallEnabled;
}

const WarRoomBoardSurface = memo(function WarRoomBoardSurface({
  isThreeD,
  boardProps,
  loadingLabel = 'Preparando sala 3D…',
  loadingClassName = 'hint-text',
}) {
  if (isThreeD) {
    return (
      <Suspense fallback={<div className={loadingClassName}>{loadingLabel}</div>}>
        <Board3D {...boardProps} />
      </Suspense>
    );
  }
  return <Board {...boardProps} />;
}, sameBoardSurfaceProps);

export default WarRoomBoardSurface;
