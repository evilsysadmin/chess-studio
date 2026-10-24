import { useState } from 'react';
import { warRoomCaptureLedger } from './GameSideColumn.jsx';
import './WarRoomCapturedPieces.css';

function groupedPieces(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const group = groups.get(entry.glyph);
    if (group) group.count += 1;
    else groups.set(entry.glyph, { ...entry, count: 1 });
  }
  return [...groups.values()];
}

function MaterialRow({ label, entries }) {
  const grouped = groupedPieces(entries);
  return (
    <div className="warroom-captures-group">
      <span className="warroom-captures-heading">{label} <small>{entries.length}</small></span>
      <div className="warroom-captures-pieces">
        {grouped.length === 0 ? <span className="warroom-captures-empty">—</span> : grouped.map((piece) => (
          <span
            className="warroom-captures-piece"
            key={piece.glyph}
            title={`${piece.label} · ${piece.count}`}
            aria-label={`${piece.count} ${piece.label.toLowerCase()}`}
          >
            <span aria-hidden="true">{piece.glyph}</span>
            {piece.count > 1 && <small aria-hidden="true">×{piece.count}</small>}
          </span>
        ))}
      </div>
    </div>
  );
}

// Presentation only: the authoritative, confirmed backend game history owns
// every capture. A renderer/variant change does not create a second ledger.
export function warRoomCaptureSummary(history, humanColor = 'w', initialFen = null) {
  const ledger = warRoomCaptureLedger(history, initialFen, humanColor);
  const playerEntries = humanColor === 'b' ? ledger.black : ledger.white;
  const opponentEntries = humanColor === 'b' ? ledger.white : ledger.black;
  const total = playerEntries.length + opponentEntries.length;
  const unknownCount = ledger.unknown.length;
  const difference = playerEntries.reduce((sum, entry) => sum + entry.value, 0)
    - opponentEntries.reduce((sum, entry) => sum + entry.value, 0);
  return { playerEntries, opponentEntries, total, unknownCount, difference };
}

export default function WarRoomCapturedPieces({ game, humanColor = 'w' }) {
  const [open, setOpen] = useState(false);
  const { playerEntries, opponentEntries, total, unknownCount, difference } =
    warRoomCaptureSummary(game?.history, humanColor, game?.initialFen);

  return (
    <aside className={`warroom-captures-drawer${open ? ' is-open' : ''}`} aria-label="Registro de capturas" data-warroom-captures="true">
      <button
        className="warroom-captures-toggle"
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="warroom-captures-detail"
        aria-label={open ? 'Ocultar capturas' : 'Mostrar capturas'}
        title={open ? 'Ocultar capturas' : 'Mostrar capturas'}
      >
        <span aria-hidden="true">{open ? '›' : '♟'}</span>
        {!open && total > 0 && <small aria-hidden="true">{total}</small>}
      </button>
      {open && (
        <div id="warroom-captures-detail" className="warroom-captures-panel" role="region" aria-label="Capturas de la partida">
          <strong className="warroom-captures-title">Capturas</strong>
          <MaterialRow label="Tus capturas" entries={playerEntries} />
          <MaterialRow label="Capturas de Matthias" entries={opponentEntries} />
          {unknownCount > 0 ? (
            <small className="warroom-captures-uncertain">Hay {unknownCount} capturas sin bando verificado.</small>
          ) : (
            <span className="warroom-captures-balance">
              Balance material <strong className={difference > 0 ? 'is-positive' : difference < 0 ? 'is-negative' : ''}>
                {difference > 0 ? '+' : ''}{difference}
              </strong>
            </span>
          )}
        </div>
      )}
    </aside>
  );
}
