import { useEffect, useMemo, useState } from 'react';
import Board from './Board.jsx';
import {
  ARENA_PRESETS,
  ARENA_START_FEN,
  arenaApplyMove,
  arenaChooseCpuMove,
  arenaKingSquare,
  arenaLegalMoves,
  arenaPieceAt,
  arenaPositionKey,
  arenaStatus,
  arenaTurn,
} from '../arenaTerrain.js';

const HUMAN_COLOR = 'w';
const CPU_COLOR = 'b';
const LIVE_STATUSES = new Set(['playing', 'check']);

function statusCopy(status, turn, thinking) {
  if (thinking) return 'Matthias calcula entre las ruinas…';
  if (status === 'checkmate') return turn === HUMAN_COLOR ? 'Jaque mate. Las ruinas no conceden indultos.' : 'Jaque mate. Arena conquistada.';
  if (status === 'stalemate') return 'Tablas por ahogado.';
  if (status === 'repetition') return 'Tablas por triple repetición.';
  if (status === 'fifty-move') return 'Tablas por 50 movimientos.';
  if (status === 'check') return turn === HUMAN_COLOR ? 'Jaque. El terreno también cuenta.' : 'Matthias está en jaque.';
  return turn === HUMAN_COLOR ? 'Tu turno.' : 'Turno de Matthias.';
}

export default function ArenaExperiment() {
  const [presetId, setPresetId] = useState(ARENA_PRESETS[0].id);
  const preset = useMemo(() => ARENA_PRESETS.find((item) => item.id === presetId) || ARENA_PRESETS[0], [presetId]);
  const blocked = preset.blocked;
  const blockedSet = useMemo(() => new Set(blocked), [blocked]);
  const [fen, setFen] = useState(ARENA_START_FEN);
  const [selected, setSelected] = useState(null);
  const [lastMove, setLastMove] = useState(null);
  const [historyKeys, setHistoryKeys] = useState(() => [arenaPositionKey(ARENA_START_FEN, ARENA_PRESETS[0].blocked)]);
  const [thinking, setThinking] = useState(false);

  const turn = arenaTurn(fen);
  const status = arenaStatus(fen, blocked, historyKeys);
  const legalFromSelected = selected ? arenaLegalMoves(fen, blocked, { from: selected }) : [];
  const legalTargets = legalFromSelected.map((move) => move.to);
  const checkSquare = status === 'check' || status === 'checkmate' ? arenaKingSquare(fen, turn) : null;

  function reset(nextPreset = preset) {
    setFen(ARENA_START_FEN);
    setSelected(null);
    setLastMove(null);
    setThinking(false);
    setHistoryKeys([arenaPositionKey(ARENA_START_FEN, nextPreset.blocked)]);
  }

  function choosePreset(nextId) {
    const next = ARENA_PRESETS.find((item) => item.id === nextId) || ARENA_PRESETS[0];
    setPresetId(next.id);
    reset(next);
  }

  function commit(move) {
    const applied = arenaApplyMove(fen, blocked, move);
    if (!applied) return false;
    setFen(applied.fen);
    setSelected(null);
    setLastMove({ from: applied.move.from, to: applied.move.to });
    setHistoryKeys((prev) => [...prev, arenaPositionKey(applied.fen, blocked)].slice(-160));
    return true;
  }

  function onSquareClick(square) {
    if (!LIVE_STATUSES.has(status) || thinking || turn !== HUMAN_COLOR || blockedSet.has(square)) return;
    const piece = arenaPieceAt(fen, square);

    if (selected) {
      const move = legalFromSelected.find((item) => item.to === square);
      if (move && commit(move)) return;
    }

    if (piece?.color === HUMAN_COLOR) setSelected(square);
    else setSelected(null);
  }

  useEffect(() => {
    if (turn !== CPU_COLOR || !LIVE_STATUSES.has(status)) return undefined;
    setThinking(true);
    const timer = window.setTimeout(() => {
      const move = arenaChooseCpuMove(fen, blocked, { depth: 2 });
      if (move) {
        const applied = arenaApplyMove(fen, blocked, move);
        if (applied) {
          setFen(applied.fen);
          setLastMove({ from: applied.move.from, to: applied.move.to });
          setHistoryKeys((prev) => [...prev, arenaPositionKey(applied.fen, blocked)].slice(-160));
        }
      }
      setThinking(false);
    }, 260);
    return () => window.clearTimeout(timer);
  }, [blocked, fen, status, turn]);

  return (
    <section className="arena-experiment" aria-label="Arena experimental con terreno bloqueado">
      <div className="arena-experiment-heading">
        <div>
          <span className="section-label">EXPERIMENTAL · NO COMPETITIVO</span>
          <h2>Arena: {preset.label}</h2>
          <p className="hint-text">{preset.summary} Juegas con blancas; Matthias lleva negras.</p>
        </div>
        <button type="button" className="secondary-btn" onClick={() => reset()}>Reiniciar arena</button>
      </div>

      <div className="arena-preset-tabs" role="radiogroup" aria-label="Geometría de la arena">
        {ARENA_PRESETS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={item.id === preset.id}
            className={item.id === preset.id ? 'active' : ''}
            onClick={() => choosePreset(item.id)}
          >
            <strong>{item.label}</strong>
            <small>{item.blocked.length} obstáculos</small>
          </button>
        ))}
      </div>

      <div className="arena-experiment-layout">
        <div className="arena-board-shell">
          <Board
            fen={fen}
            orientation="white"
            onSquareClick={onSquareClick}
            selectedSquare={selected}
            legalTargets={legalTargets}
            lastMove={lastMove}
            checkSquare={checkSquare}
            turnState={turn === HUMAN_COLOR ? 'human' : 'cpu'}
            themeOverride="obsidian"
            squareClassName={(square) => blockedSet.has(square) ? 'arena-terrain-blocked' : ''}
            squareBadge={(square) => blockedSet.has(square)
              ? <span className="arena-terrain-marker" title="Terreno bloqueado" aria-label="Terreno bloqueado">◆</span>
              : null}
          />
        </div>

        <aside className="arena-rules-card">
          <span className="section-label">ESTADO DE BATALLA</span>
          <strong className="arena-status">{statusCopy(status, turn, thinking)}</strong>
          <div className="arena-rule-list">
            <p><b>◆ Obstáculo:</b> ninguna pieza puede ocuparlo.</p>
            <p><b>Torres, alfiles y damas:</b> no pueden atravesarlo.</p>
            <p><b>Caballos:</b> saltan por encima como siempre, pero no aterrizan sobre él.</p>
            <p><b>Rey:</b> jaque y mate se recalculan con la geometría real de la arena.</p>
          </div>
          <small>Este prototipo es local: no modifica rating, carrera, historial ni estadísticas personales.</small>
        </aside>
      </div>

      <details className="friendly-disclosure arena-technical-note">
        <summary>Qué reglas normales siguen intactas</summary>
        <div className="friendly-disclosure-body">
          <p>Promoción, enroque, en passant, regla de 50 movimientos y triple repetición siguen existiendo. El terreno sólo añade casillas sólidas.</p>
          <p>El objetivo de esta fase es demostrar que una geometría rara puede seguir sintiéndose como ajedrez antes de intentar puentes, despliegues asimétricos o tableros mayores.</p>
        </div>
      </details>
    </section>
  );
}
