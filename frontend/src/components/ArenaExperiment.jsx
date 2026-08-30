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
import { arenaObjectiveState } from '../arenaObjectives.js';

const HUMAN_COLOR = 'w';
const CPU_COLOR = 'b';
const LIVE_STATUSES = new Set(['playing', 'check']);
const TERRAIN_MARKER_STYLE = Object.freeze({
  position: 'absolute',
  inset: '11%',
  display: 'grid',
  placeItems: 'center',
  border: '1px solid rgba(220,210,190,.36)',
  borderRadius: '18%',
  background: 'radial-gradient(circle at 38% 28%, rgba(255,255,255,.16), transparent 28%), linear-gradient(145deg, rgba(77,81,86,.96), rgba(24,27,31,.98))',
  color: 'rgba(232,222,201,.86)',
  fontSize: 'clamp(.65rem, 2vw, 1.1rem)',
  boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.35), 0 2px 5px rgba(0,0,0,.28)',
  pointerEvents: 'none',
});

function statusCopy(status, turn, thinking) {
  if (thinking) return 'Matthias calcula entre las ruinas…';
  if (status === 'checkmate') return turn === HUMAN_COLOR ? 'Jaque mate. Las ruinas no conceden indultos.' : 'Jaque mate. Arena conquistada.';
  if (status === 'stalemate') return 'Tablas por ahogado.';
  if (status === 'repetition') return 'Tablas por triple repetición.';
  if (status === 'fifty-move') return 'Tablas por 50 movimientos.';
  if (status === 'check') return turn === HUMAN_COLOR ? 'Jaque. El terreno también cuenta.' : 'Matthias está en jaque.';
  return turn === HUMAN_COLOR ? 'Tu turno.' : 'Turno de Matthias.';
}

function startFenFor(preset) {
  return preset?.startFen || ARENA_START_FEN;
}

export default function ArenaExperiment() {
  const [presetId, setPresetId] = useState(ARENA_PRESETS[0].id);
  const preset = useMemo(() => ARENA_PRESETS.find((item) => item.id === presetId) || ARENA_PRESETS[0], [presetId]);
  const blocked = preset.blocked;
  const blockedSet = useMemo(() => new Set(blocked), [blocked]);
  const [fen, setFen] = useState(() => startFenFor(ARENA_PRESETS[0]));
  const [selected, setSelected] = useState(null);
  const [lastMove, setLastMove] = useState(null);
  const [elapsedPlies, setElapsedPlies] = useState(0);
  const [historyKeys, setHistoryKeys] = useState(() => {
    const initial = ARENA_PRESETS[0];
    return [arenaPositionKey(startFenFor(initial), initial.blocked)];
  });
  const [thinking, setThinking] = useState(false);

  const turn = arenaTurn(fen);
  const status = arenaStatus(fen, blocked, historyKeys);
  const objective = arenaObjectiveState(preset.id, fen, { elapsedPlies, humanColor: HUMAN_COLOR });
  const legalFromSelected = selected ? arenaLegalMoves(fen, blocked, { from: selected }) : [];
  const boardLegalTargets = legalFromSelected.map((move) => ({ ...move, san: move.captured ? 'x' : '' }));
  const checkSquare = status === 'check' || status === 'checkmate' ? arenaKingSquare(fen, turn) : null;

  function reset(nextPreset = preset) {
    const startFen = startFenFor(nextPreset);
    setFen(startFen);
    setSelected(null);
    setLastMove(null);
    setElapsedPlies(0);
    setThinking(false);
    setHistoryKeys([arenaPositionKey(startFen, nextPreset.blocked)]);
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
    setElapsedPlies((value) => value + 1);
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
      const move = arenaChooseCpuMove(fen, blocked, { depth: 1 });
      if (move) {
        const applied = arenaApplyMove(fen, blocked, move);
        if (applied) {
          setFen(applied.fen);
          setLastMove({ from: applied.move.from, to: applied.move.to });
          setElapsedPlies((value) => value + 1);
          setHistoryKeys((prev) => [...prev, arenaPositionKey(applied.fen, blocked)].slice(-160));
        }
      }
      setThinking(false);
    }, 260);
    return () => window.clearTimeout(timer);
  }, [blocked, fen, status, turn]);

  return (
    <section className="arena-experiment" aria-label="Arena experimental con terreno bloqueado">
      <div className="menu-section">
        <div className="combat-heading-row">
          <div>
            <span className="section-label">EXPERIMENTAL · NO COMPETITIVO</span>
            <h2>Arena: {preset.label}</h2>
          </div>
          <button type="button" className="secondary-btn" onClick={() => reset()}>Reiniciar arena</button>
        </div>
        <p className="hint-text">{preset.summary} Juegas con blancas; Matthias lleva negras.</p>
        <div className="career-mini-grid">
          <span><b>Despliegue</b><small>{preset.deployment || 'Clásico'}</small></span>
          <span><b>Terreno sólido</b><small>{preset.blocked.length} casillas</small></span>
        </div>
        {objective && (
          <div className={`coaching-action ${objective.achieved ? 'is-success' : objective.failed ? 'is-danger' : ''}`} style={{ marginTop: '.8rem' }} role="status">
            <strong>{objective.achieved ? '✓ MISIÓN CUMPLIDA' : objective.failed ? '✕ MISIÓN FALLIDA' : 'OBJETIVO OPCIONAL'} · {objective.label}</strong>
            <span>{objective.detail}{objective.target > 1 ? ` · progreso ${objective.progress}/${objective.target}` : ''}</span>
          </div>
        )}
      </div>

      <div className="career-section-nav" role="radiogroup" aria-label="Geometría de la arena">
        {ARENA_PRESETS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={item.id === preset.id}
            className={item.id === preset.id ? 'active' : ''}
            onClick={() => choosePreset(item.id)}
          >
            {item.label} · {item.blocked.length}
          </button>
        ))}
      </div>

      <div className="lab-board-editor">
        <Board
          fen={fen}
          orientation="white"
          onSquareClick={onSquareClick}
          selectedSquare={selected}
          legalTargets={boardLegalTargets}
          lastMove={lastMove}
          checkSquare={checkSquare}
          turnState={turn === HUMAN_COLOR ? 'human' : 'cpu'}
          themeOverride="obsidian"
          squareClassName={(square) => blockedSet.has(square) ? 'arena-terrain-blocked' : ''}
          squareBadge={(square) => blockedSet.has(square)
            ? <span style={TERRAIN_MARKER_STYLE} title="Terreno bloqueado" aria-label="Terreno bloqueado">◆</span>
            : null}
        />
      </div>

      <aside className="menu-section">
        <span className="section-label">ESTADO DE BATALLA</span>
        <h3>{statusCopy(status, turn, thinking)}</h3>
        <div className="career-mini-grid">
          <span><b>◆ Sólido</b><small>No se puede ocupar ni atravesar.</small></span>
          <span><b>♜ ♝ ♛</b><small>Sus rayos terminan en el obstáculo.</small></span>
          <span><b>♞ Salta</b><small>El caballo ignora el terreno intermedio.</small></span>
          <span><b>♔ Real</b><small>Jaque y mate usan esta geometría.</small></span>
        </div>
        <p className="hint-text">Las misiones son objetivos opcionales locales: no cambian la legalidad, no otorgan rating y no sustituyen jaque mate/tablas.</p>
      </aside>

      <details className="friendly-disclosure">
        <summary>Qué cambia en esta fase</summary>
        <div className="friendly-disclosure-body">
          <p>Promoción, enroque, en passant, regla de 50 movimientos y triple repetición siguen intactos. El terreno continúa siendo la única regla que modifica el tablero.</p>
          <p>Ruptura y supervivencia son condiciones de misión superpuestas: sirven para obligarte a jugar con un propósito táctico distinto sin crear movimientos especiales ni resultados competitivos falsos.</p>
        </div>
      </details>
    </section>
  );
}
