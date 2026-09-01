import { Suspense, lazy, useEffect, useState } from 'react';
import Board from './Board.jsx';
import { getConfiguredBoardRendererDefault, USER_PREFERENCES_CHANGED_EVENT } from '../userPreferences.js';

const Board3D = lazy(() => import('./Board3D.jsx'));

export function getSchoolBoardRenderer() {
  return getConfiguredBoardRendererDefault() === '3d' ? '3d' : '2d';
}

export default function SchoolBoard(props) {
  const [renderer, setRenderer] = useState(() => getSchoolBoardRenderer());

  useEffect(() => {
    const refreshRenderer = () => setRenderer(getSchoolBoardRenderer());
    window.addEventListener(USER_PREFERENCES_CHANGED_EVENT, refreshRenderer);
    return () => window.removeEventListener(USER_PREFERENCES_CHANGED_EVENT, refreshRenderer);
  }, []);

  if (renderer !== '3d') return <Board {...props} />;

  return (
    <Suspense fallback={<Board {...props} />}>
      <Board3D {...props} />
    </Suspense>
  );
}