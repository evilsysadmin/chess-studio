import { useLayoutEffect } from 'react';
import { BoardRendererContext } from './Board.jsx';
import Board3DCore from './Board3DCore.jsx';
import { setWarRoomHansQuickIterationEnabled } from './WarRoomHansIteration.js';

// Safe public entrypoint. GameBoardView also imports Board3D directly, so the
// provider must live here rather than only in the preferred Board wrapper.
// If WebGL dies, Board3DCore falls back through Board; the context tells that
// nested Board to render the concrete 2D implementation instead of recursing.
export default function Board3D(props) {
  const ownsHansQuickIteration = props.hansFireplaceIteration === true;

  // Hans' forced visual iteration is scene ownership, not a render-time global
  // preference. A quick-game War Room acquires the flag before Board3DCore's
  // passive scene-construction effect and keeps it for the lifetime of that
  // mounted renderer. Other 3D renders deliberately do nothing instead of
  // resetting a flag owned by an active quick-game scene.
  useLayoutEffect(() => {
    if (!ownsHansQuickIteration) return undefined;
    setWarRoomHansQuickIterationEnabled(true);
    return () => setWarRoomHansQuickIterationEnabled(false);
  }, [ownsHansQuickIteration]);

  return (
    <BoardRendererContext.Provider value="3d">
      <Board3DCore {...props} />
    </BoardRendererContext.Provider>
  );
}
