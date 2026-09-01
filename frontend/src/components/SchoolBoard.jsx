import { Suspense, lazy } from 'react';
import Board from './Board.jsx';
import { getConfiguredBoardRendererDefault } from '../userPreferences.js';

const Board3D = lazy(() => import('./Board3D.jsx'));

export function getSchoolBoardRenderer() {
  return getConfiguredBoardRendererDefault() === '3d' ? '3d' : '2d';
}

export default function SchoolBoard(props) {
  const renderer = getSchoolBoardRenderer();
  if (renderer !== '3d') return <Board {...props} />;

  return (
    <Suspense fallback={<Board {...props} />}>
      <Board3D {...props} />
    </Suspense>
  );
}
