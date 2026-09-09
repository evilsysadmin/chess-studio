import GameChat from './GameChat.jsx';
import MusicPlayer from './MusicPlayer.jsx';
import NotationPanel from './NotationPanel.jsx';
import { formatLongMove } from '../notation.js';
import { identifyOpening } from '../openings.js';
import './GameSideColumn.css';

function recentNotationPairs(history, limit = 2) {
  const pairs = [];
  for (let i = 0; i < history.length; i += 2) {
    pairs.push({
      num: i / 2 + 1,
      white: history[i],
      black: history[i + 1],
    });
  }
  return pairs.slice(-limit);
}

function CompactNotationPreview({ history, difficulty }) {
  const opening = identifyOpening(history.map((move) => move.san));
  const pairs = recentNotationPairs(history);

  return (
    <div className="game-notation-compact-preview">
      {opening && <p className="game-notation-compact-opening">{opening}</p>}
      <div className="game-notation-compact-list" aria-label="Últimas jugadas">
        {pairs.length === 0 && <p className="game-notation-compact-empty">Todavía no hay jugadas.</p>}
        {pairs.map((pair) => (
          <div className="game-notation-compact-move" key={pair.num}>
            <span className="num">{pair.num}.</span>
            <span title={pair.white?.san}>{pair.white ? formatLongMove(pair.white) : ''}</span>
            <span title={pair.black?.san}>{pair.black ? formatLongMove(pair.black) : ''}</span>
          </div>
        ))}
      </div>
      <details className="game-notation-full-disclosure">
        <summary>
          Ver cuaderno completo <span aria-hidden="true">→</span>
        </summary>
        <div className="game-notation-full-panel">
          <NotationPanel history={history} difficulty={difficulty} />
        </div>
      </details>
    </div>
  );
}

export default function GameSideColumn({ game, side, isThreeD, compactViewport }) {
  const compactNotation = isThreeD && !compactViewport;

  return (
    <aside className={`game-side-column${isThreeD ? ' game-side-column-3d' : ''}`} aria-label="Chat de partida">
      <div className="game-side-music" aria-label="Música de la partida">
        <MusicPlayer initiallyCollapsed />
      </div>
      <details
        className={`game-notation-disclosure${compactNotation ? ' game-notation-disclosure-compact' : ''}`}
        open={side.notationOpen}
        onToggle={(event) => side.onNotationOpenChange(event.currentTarget.open)}
      >
        <summary aria-label={`Cuaderno de jugadas · ${game.history.length} movimientos`}>
          {compactNotation ? `Cuaderno · ${game.history.length}` : `Cuaderno de jugadas · ${game.history.length} movimientos`}
        </summary>
        <div className="game-notation-row">
          {compactNotation ? (
            <CompactNotationPreview history={game.history} difficulty={game.difficulty} />
          ) : (
            <NotationPanel history={game.history} difficulty={game.difficulty} />
          )}
        </div>
      </details>
      {(!isThreeD || compactViewport) && (
        <GameChat messages={side.gameChat} contextMessages={side.gameContextMessages} />
      )}
    </aside>
  );
}
