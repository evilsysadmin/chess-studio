import { useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import PreferredBoard from './PreferredBoard.jsx';
import { api } from '../api.js';
import { difficultyLabel } from '../difficulty.js';
import { formatLongMove } from '../notation.js';
import { identifyOpening } from '../openings.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { playMoveSound, playCaptureSound, playSuccessSound } from '../sound.js';
import MechanicTutorialHelp from './MechanicTutorialHelp.jsx';
import { checkedKingSquare } from '../boardState.js';
import { abortableDelay, isAbortError } from '../asyncControl.js';
import { applySuggestedOrLegalFallback, standardChessStatus } from '../chessRules.js';

const PACE_OPTIONS = [
  { id: 'slow', label: 'Lenta (4s)', ms: 4000 },
  { id: 'normal', label: 'Normal (2.5s)', ms: 2500 },
  { id: 'fast', label: 'Rápida (1s)', ms: 1000 },
];

function randomLevel() {
  return Math.floor(Math.random() * 101);
}

function statusOf(chess) {
  return standardChessStatus(chess);
}

export default function SpectatorScreen({ onExit }) {
  const [phase, setPhase] = useState('setup'); // 'setup' | 'watching' | 'over'
  const [whiteChoice, setWhiteChoice] = useState(50);
  const [blackChoice, setBlackChoice] = useState(50);
  const [whiteRandom, setWhiteRandom] = useState(false);
  const [blackRandom, setBlackRandom] = useState(false);
  const [paceId, setPaceId] = useState('normal');

  const [whiteLevel, setWhiteLevel] = useState(50);
  const [blackLevel, setBlackLevel] = useState(50);
  const [fen, setFen] = useState(new Chess().fen());
  const [moves, setMoves] = useState([]); // [{ san, from, to, captured, by: 'w'|'b' }]
  const [lastMove, setLastMove] = useState(null);
  const [paused, setPaused] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState(null);

  const chessRef = useRef(new Chess());
  const pausedRef = useRef(false);
  const stopRef = useRef(false);
  const generationRef = useRef(0);
  const loopAbortRef = useRef(null);

  // Mismo patrón que en Combate: en pleno partido ESC no hace nada (para no
  // cortar de golpe algo que se está mirando), pero en configuración o al
  // terminar sí vuelve al menú.
  useEscapeToClose(() => {
    if (phase !== 'watching') onExit();
  });

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    return () => {
      stopRef.current = true;
      generationRef.current += 1;
      loopAbortRef.current?.abort(new DOMException('Spectator unmounted', 'AbortError'));
      loopAbortRef.current = null;
    };
  }, []);

  function startMatch() {
    const wLevel = whiteRandom ? randomLevel() : whiteChoice;
    const bLevel = blackRandom ? randomLevel() : blackChoice;
    setWhiteLevel(wLevel);
    setBlackLevel(bLevel);

    chessRef.current = new Chess();
    setFen(chessRef.current.fen());
    setMoves([]);
    setLastMove(null);
    setPaused(false);
    setError(null);
    stopRef.current = true;
    loopAbortRef.current?.abort(new DOMException('New spectator match', 'AbortError'));
    const controller = new AbortController();
    loopAbortRef.current = controller;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    stopRef.current = false;
    setPhase('watching');

    void runMatchLoop(wLevel, bLevel, generation, controller);
  }

  async function runMatchLoop(wLevel, bLevel, generation, controller) {
    const pace = PACE_OPTIONS.find((p) => p.id === paceId) || PACE_OPTIONS[1];
    const signal = controller.signal;
    const stale = () => stopRef.current || signal.aborted || generationRef.current !== generation;

    try {
      while (!stale()) {
        const chess = chessRef.current;
        if (chess.isGameOver()) {
          if (!stale()) setPhase('over');
          return;
        }

        while (pausedRef.current && !stale()) {
          await abortableDelay(150, signal);
        }
        if (stale()) return;

        const turn = chess.turn();
        const level = turn === 'w' ? wLevel : bLevel;
        const requestedFen = chess.fen();
        setThinking(true);
        let suggestion = null;
        try {
          suggestion = await api.analyzePosition(requestedFen, level, { signal });
        } catch (e) {
          if (isAbortError(e) || stale()) return;
          // El loop no depende de que el analizador remoto esté sano.
          suggestion = null;
        }
        if (stale() || chessRef.current !== chess || chess.fen() !== requestedFen) return;
        setThinking(false);

        const { move: applied } = applySuggestedOrLegalFallback(chess, suggestion);
        if (!applied) {
          if (chess.isGameOver()) setPhase('over');
          else {
            setError('No se encontró ninguna jugada legal para continuar.');
            setPhase('setup');
          }
          return;
        }

        setFen(chess.fen());
        setLastMove({ from: applied.from, to: applied.to });
        setMoves((prev) => [...prev, { san: applied.san, from: applied.from, to: applied.to, captured: !!applied.captured, by: turn }]);

        if (applied.captured) playCaptureSound();
        else playMoveSound();

        if (chess.isGameOver()) {
          if (chess.isCheckmate()) playSuccessSound();
          setPhase('over');
          return;
        }

        await abortableDelay(pace.ms, signal);
      }
    } catch (e) {
      if (!isAbortError(e) && !stale()) {
        setError(e?.message || 'La partida espectador se interrumpió.');
        setPhase('setup');
      }
    } finally {
      if (generationRef.current === generation) {
        setThinking(false);
        if (loopAbortRef.current === controller) loopAbortRef.current = null;
      }
    }
  }

  function stopAndExit() {
    stopRef.current = true;
    generationRef.current += 1;
    loopAbortRef.current?.abort(new DOMException('Spectator stopped', 'AbortError'));
    loopAbortRef.current = null;
    onExit();
  }

  const status = statusOf(chessRef.current);
  const checkSquare = checkedKingSquare(fen);
  const opening = identifyOpening(moves.map((m) => m.san));
  const resultText = {
    checkmate: `Jaque mate — ganaron las ${chessRef.current.turn() === 'w' ? 'negras' : 'blancas'}.`,
    stalemate: 'Ahogado — tablas.',
    repetition: 'Tablas por triple repetición.',
    draw: 'Tablas.',
  }[status];

  if (phase === 'setup') {
    const pace = PACE_OPTIONS.find((p) => p.id === paceId) || PACE_OPTIONS[1];
    const whiteSummary = whiteRandom ? 'aleatorio' : `${difficultyLabel(whiteChoice)} (${whiteChoice})`;
    const blackSummary = blackRandom ? 'aleatorio' : `${difficultyLabel(blackChoice)} (${blackChoice})`;
    return (
      <div className="menu spectator-friendly">
        <button className="back-link" onClick={onExit}>← Volver al menú</button>

        <div className="menu-section friendly-primary-zone">
          <span className="section-label">Modo espectador</span>
          <div className="combat-heading-row"><h2>Dos CPU, un tablero</h2><MechanicTutorialHelp tutorialId="spectator" /></div>
          <p className="hero-scope-note friendly-lead">Pulsa empezar y mira. Si quieres, antes puedes cambiar niveles o velocidad.</p>

          {error && <p className="error-text">{error}</p>}

          <button type="button" className="primary-btn friendly-main-cta" onClick={startMatch}>Empezar partida</button>

          <details className="friendly-disclosure spectator-settings">
            <summary>Ajustes · blancas {whiteSummary} · negras {blackSummary} · {pace.label}</summary>
            <div className="friendly-disclosure-body">
              <div className="spectator-side-setup">
                <div className="spectator-side-block">
                  <h3>Blancas</h3>
                  <label className="spectator-random-toggle">
                    <input type="checkbox" checked={whiteRandom} onChange={(e) => setWhiteRandom(e.target.checked)} /> Nivel aleatorio
                  </label>
                  {!whiteRandom && (
                    <div className="difficulty-slider-row">
                      <input type="range" min="0" max="100" value={whiteChoice} onChange={(e) => setWhiteChoice(Number(e.target.value))} className="difficulty-slider" />
                      <div className="difficulty-readout"><span className="difficulty-number">{whiteChoice}</span><span className="difficulty-word">{difficultyLabel(whiteChoice)}</span></div>
                    </div>
                  )}
                </div>

                <div className="spectator-side-block">
                  <h3>Negras</h3>
                  <label className="spectator-random-toggle">
                    <input type="checkbox" checked={blackRandom} onChange={(e) => setBlackRandom(e.target.checked)} /> Nivel aleatorio
                  </label>
                  {!blackRandom && (
                    <div className="difficulty-slider-row">
                      <input type="range" min="0" max="100" value={blackChoice} onChange={(e) => setBlackChoice(Number(e.target.value))} className="difficulty-slider" />
                      <div className="difficulty-readout"><span className="difficulty-number">{blackChoice}</span><span className="difficulty-word">{difficultyLabel(blackChoice)}</span></div>
                    </div>
                  )}
                </div>
              </div>

              <div className="time-control-row">
                <label className="time-control-label">Ritmo</label>
                <select value={paceId} onChange={(e) => setPaceId(e.target.value)} className="time-control-select">
                  {PACE_OPTIONS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>
            </div>
          </details>
        </div>
      </div>
    );
  }

  return (
    <div className="tutorial-shell">
      <button className="back-link" onClick={stopAndExit}>← Volver al menú</button>

      <div className="spectator-players-row">
        <span className="spectator-player-tag">♔ Blancas · {difficultyLabel(whiteLevel)} ({whiteLevel})</span>
        <span className="spectator-player-tag">♚ Negras · {difficultyLabel(blackLevel)} ({blackLevel})</span>
      </div>

      <div className="game-layout">
        <div className="board-column">
          <PreferredBoard fen={fen} lastMove={lastMove} orientation="white" checkSquare={checkSquare} />
          {phase === 'watching' && status === 'check' && <p className="status-line" role="status" aria-label="Estado de la partida espectador">Jaque</p>}

          {phase === 'watching' && (
            <div className="game-controls">
              <button type="button" className="secondary-btn" onClick={() => setPaused((p) => !p)}>
                {paused ? '▶ Reanudar' : '⏸ Pausar'}
              </button>
              {thinking && <span className="hint-text spectator-thinking">Pensando…</span>}
            </div>
          )}

          {phase === 'over' && (
            <div className="endgame-banner">
              <h2>Partida terminada</h2>
              <p>{resultText || error || 'Terminó la partida.'}</p>
              <button className="primary-btn" onClick={startMatch}>Ver otra partida</button>
            </div>
          )}
        </div>

        <aside className="notation-panel">
          <h3>Jugadas</h3>
          {opening && <p className="opening-tag">{opening}</p>}
          <div className="notation-list">
            {moves.length === 0 && <p className="notation-empty">Todavía no se jugó nada.</p>}
            {moves.map((m, i) => (
              <div className="notation-row-flat" key={i}>
                <span className="num">{Math.floor(i / 2) + 1}{m.by === 'w' ? '.' : '...'}</span>
                <span>{formatLongMove(m)}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
