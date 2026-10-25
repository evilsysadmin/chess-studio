import { useState } from 'react';
import GameChat from './GameChat.jsx';
import MusicPlayer from './MusicPlayer.jsx';
import NotationPanel from './NotationPanel.jsx';
import WarRoomAmbienceToggle from './WarRoomAmbienceToggle.jsx';
import { formatLongMove } from '../notation.js';
import { identifyOpening } from '../openings.js';
import { chessFromFen, safeChessMove } from '../chessRules.js';
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

export function warRoomCaptureLedger(history = [], initialFen = null, humanColor = 'w') {
  const ledger = { white: [], black: [], unknown: [] };
  let chess = chessFromFen(initialFen || undefined);
  const moves = Array.isArray(history) ? history : [];

  moves.forEach((move, index) => {
    // Some backend/legacy histories contain only `captured: true`. Replay
    // from the authoritative initial position to recover the actual piece and
    // mover colour, including en passant. Never infer a piece from SAN alone.
    let played = null;
    if (chess) {
      if (move?.from && move?.to) played = safeChessMove(chess, move);
      else if (move?.san) {
        try { played = chess.move(move.san); } catch { played = null; }
      }
      if (!played) chess = null;
    }

    const type = played ? played.captured : (typeof move?.captured === 'string' ? move.captured : null);
    const piece = CAPTURE_PIECES[type];
    if (!piece) {
      if ((!played && move?.captured) || (played && played.captured && !piece)) {
        ledger.unknown.push({ key: index });
      }
      return;
    }

    const color = played?.color || move?.color
      || (move?.by === 'human' ? humanColor : move?.by === 'cpu' ? (humanColor === 'w' ? 'b' : 'w') : null);
    const entry = {
      key: `${index}-${move?.san || type}`,
      label: piece.label,
      value: piece.value,
      san: move?.san || '',
      glyph: color === 'w' ? piece.black : color === 'b' ? piece.white : '×',
    };
    if (color === 'w') ledger.white.push(entry);
    else if (color === 'b') ledger.black.push(entry);
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
