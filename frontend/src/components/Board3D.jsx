import { useLayoutEffect } from 'react';
import { BoardRendererContext } from './Board.jsx';
import Board3DCore from './Board3DCore.jsx';
import {
  acquireWarRoomHansQuickIteration,
  releaseWarRoomHansQuickIteration,
} from './WarRoomHansIteration.js';
import { claimWarRoomHansAppearanceForGame } from './WarRoomHansPerGame.js';

// Safe public entrypoint. GameBoardView also imports Board3D directly, so the
// provider must live here rather than only in the preferred Board wrapper.
// If WebGL dies, Board3DCore falls back through Board; the context tells that
// nested Board to render the concrete 2D implementation instead of recursing.
export default function Board3D(props) {
  const requestsHansQuickIteration = props.hansFireplaceIteration === true;
  const hansGameId = props.gameId;

  // A quick-game War Room may summon Hans once for the concrete game id. The
  // claim is persisted through safeStorage so 2D/3D toggles, scene rebuilds,
  // F5 and active-game recovery cannot replay the same cameo. A different game
  // id gets a fresh claim. Layout effect still runs before Board3DCore's passive
  // scene-construction effect, so an accepted claim arms the renderer in time.
  useLayoutEffect(() => {
    if (!requestsHansQuickIteration) return undefined;
    if (!claimWarRoomHansAppearanceForGame(hansGameId)) return undefined;
    acquireWarRoomHansQuickIteration();
    return () => releaseWarRoomHansQuickIteration();
  }, [requestsHansQuickIteration, hansGameId]);

  return (
    <BoardRendererContext.Provider value="3d">
      <span
        hidden
        aria-hidden="true"
        data-war-room-hans-quick-request={requestsHansQuickIteration ? 'true' : 'false'}
        data-war-room-hans-game-id={hansGameId || ''}
        data-war-room-hans-runtime={requestsHansQuickIteration ? 'pending' : 'idle'}
      />
      <Board3DCore {...props} />
    </BoardRendererContext.Provider>
  );
}
