import GameChat from './GameChat.jsx';
import MusicPlayer from './MusicPlayer.jsx';
import NotationPanel from './NotationPanel.jsx';

export default function GameSideColumn({ game, side, isThreeD }) {
  return (
    <aside className={`game-side-column${isThreeD ? ' game-side-column-3d' : ''}`} aria-label="Chat de partida">
      <div className="game-side-music" aria-label="Música de la partida">
        <MusicPlayer initiallyCollapsed />
      </div>
      <details className="game-notation-disclosure" open={side.notationOpen} onToggle={(event) => side.onNotationOpenChange(event.currentTarget.open)}>
        <summary>Cuaderno de jugadas · {game.history.length} movimientos</summary>
        <div className="game-notation-row">
          <NotationPanel history={game.history} difficulty={game.difficulty} />
        </div>
      </details>
      <GameChat messages={side.gameChat} contextMessages={side.gameContextMessages} />
    </aside>
  );
}
