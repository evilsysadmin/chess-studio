import { lazy, Suspense } from 'react';
import Board from './Board.jsx';
import useGameBoardRenderer from './useGameBoardRenderer.js';

const Board3D = lazy(() => import('./Board3D.jsx'));

/**
 * Standard chess-board surface that follows the user's renderer preference.
 * The product default is 3D; 2D remains an explicit choice and the safe
 * fallback while the 3D bundle loads or when WebGL is unavailable.
 */
export default function PreferredBoard(props) {
  const { isThreeD } = useGameBoardRenderer();

  if (!isThreeD) return <Board {...props} />;

  return (
    <Suspense fallback={<Board {...props} />}>
      <Board3D {...props} />
    </Suspense>
  );
}
