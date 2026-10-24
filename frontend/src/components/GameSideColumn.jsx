import { useState } from 'react';
import GameChat from './GameChat.jsx';
import MusicPlayer from './MusicPlayer.jsx';
import NotationPanel from './NotationPanel.jsx';
import WarRoomAmbienceToggle from './WarRoomAmbienceToggle.jsx';
import { formatLongMove } from '../notation.js';
import { identifyOpening } from '../openings.js';
import './GameSideColumn.css';
import './WarRoomTabbedRail.css';

const CAPTURE_PIECES = {
  p: { label: 'Peón', white: '♙', black: '♟', value: 1 },
  n: { label: 'Caballo', white: '♘', black: '♞', value: 3 },
  b: { label: 'Alfil', white: '♗', black: '♝', value: 3 },
  r: { label: 'Torre', white: '♖', black: '♜', value: 5 },
  q: { label: 'Dama', white: '♕', black: '♛', value: 9 },
};

function recentNotationPairs(history, limit = 1) {
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

export function warRoomCaptureLedger(history = []) {
  const ledger = { white: [], black: [], unknown: [] };

  history.forEach((move, index) => {
    const piece = CAPTURE_PIECES[move?.captured];
    if (!piece) return;

    const entry = {
      key: `${index}-${move?.san || move?.captured}`,
      label: piece.label,
      value: piece.value,
      san: move?.san || '',
      glyph: move?.color === 'w' ? piece.black : move?.color === 'b' ? piece.white : '×',
    };

    if (move?.color === 'w') ledger.white.push(entry);
    else if (move?.color === 'b') ledger.black.push(entry);
    else ledger.unknown.push(entry);
  });

  return ledger;
}

function WarRoomTabbedRail({ game, side }) {
  const [activeTab, setActiveTab] = useState('matthias');
  const tabs = [
    { id: 'matthias', label: 'Matthias' },
    { id: 'notebook', label: 'Cuaderno', count: game.history.length },
  ];
  const active = tabs.find((tab) => tab.id === activeTab) || tabs[0];

  function selectTab(nextTab) {
    setActiveTab(nextTab);
    side.onNotationOpenChange?.(nextTab === 'notebook');
  }

  return (
    <section className="game-warroom-rail" aria-label="Panel lateral de la War Room">
      <div className="game-warroom-rail-tabs" aria-label="Información de la partida">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`warroom-tab-${tab.id}`}
            type="button"
            className={activeTab === tab.id ? 'is-active' : ''}
            aria-pressed={activeTab === tab.id}
            aria-controls="warroom-rail-panel"
            onClick={() => selectTab(tab.id)}
          >
            <span>{tab.label}</span>
            {Number(tab.count) > 0 && <small>{tab.count}</small>}
          </button>
        ))}
      </div>
      <div
        id="warroom-rail-panel"
        className={`game-warroom-rail-panel is-${active.id}`}
        role="region"
        aria-labelledby={`warroom-tab-${active.id}`}
      >
        {activeTab === 'matthias' && (
          <GameChat messages={side.gameChat} contextMessages={side.gameContextMessages} />
        )}
        {activeTab === 'notebook' && (
          <CompactNotationPreview history={game.history} difficulty={game.difficulty} />
        )}
      </div>
    </section>
  );
}

export default function GameSideColumn({ game, side, isThreeD, compactViewport, showMusic = true }) {
  const desktopWarRoom = isThreeD && !compactViewport;

  return (
    <aside className={`game-side-column${isThreeD ? ' game-side-column-3d' : ''}`} aria-label="Panel lateral de partida">
      {showMusic && (
        <div className={`game-side-music${isThreeD ? ' game-side-music-warroom' : ''}`} aria-label="Música de la partida">
          <MusicPlayer initiallyCollapsed />
          {isThreeD && <WarRoomAmbienceToggle />}
        </div>
      )}
      {desktopWarRoom ? (
        <WarRoomTabbedRail game={game} side={side} />
      ) : (
        <>
          <details
            className="game-notation-disclosure"
            open={side.notationOpen}
            onToggle={(event) => side.onNotationOpenChange(event.currentTarget.open)}
          >
            <summary aria-label={`Cuaderno de jugadas · ${game.history.length} movimientos`}>
              Cuaderno de jugadas · {game.history.length} movimientos
            </summary>
            <div className="game-notation-row">
              <NotationPanel history={game.history} difficulty={game.difficulty} />
            </div>
          </details>
          <GameChat messages={side.gameChat} contextMessages={side.gameContextMessages} />
        </>
      )}
    </aside>
  );
}
