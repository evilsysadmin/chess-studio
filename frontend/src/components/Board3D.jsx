import { useLayoutEffect } from 'react';
import { BoardRendererContext } from './Board.jsx';
import Board3DCore from './Board3DCore.jsx';
import {
  acquireWarRoomHansQuickIteration,
  releaseWarRoomHansQuickIteration,
} from './WarRoomHansIteration.js';

// Safe public entrypoint. GameBoardView also imports Board3D directly, so the
// provider must live here rather than only in the preferred Board wrapper.
// If WebGL dies, Board3DCore falls back through Board; the context tells that
// nested Board to render the concrete 2D implementation instead of recursing.
export default function Board3D(props) {
  const ownsHansQuickIteration = props.hansFireplaceIteration === true;

  // A quick-game War Room owns the Hans visual-iteration lease for its whole
  // mounted lifetime. Previously every Board3D render wrote a shared boolean;
  // a secondary/transient 3D render without the prop could clear it before the
  // deferred War Room finalizer ran, leaving the door present but Hans absent.
  // Layout effect runs before Board3DCore's passive scene-construction effect.
  useLayoutEffect(() => {
    if (!ownsHansQuickIteration) return undefined;
    acquireWarRoomHansQuickIteration();
    return () => releaseWarRoomHansQuickIteration();
  }, [ownsHansQuickIteration]);

  return (
    <BoardRendererContext.Provider value="3d">
      <Board3DCore {...props} />
    </BoardRendererContext.Provider>
  );
}
