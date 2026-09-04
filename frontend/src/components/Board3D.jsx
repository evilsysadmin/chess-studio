import { BoardRendererContext } from './Board.jsx';
import Board3DCore from './Board3DCore.jsx';

// Safe public entrypoint. GameBoardView also imports Board3D directly, so the
// provider must live here rather than only in the preferred Board wrapper.
// If WebGL dies, Board3DCore falls back through Board; the context tells that
// nested Board to render the concrete 2D implementation instead of recursing.
export default function Board3D(props) {
  return (
    <BoardRendererContext.Provider value="3d">
      <Board3DCore {...props} />
    </BoardRendererContext.Provider>
  );
}
