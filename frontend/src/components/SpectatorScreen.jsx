import React, { useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import Board from './Board.jsx';
import { api } from '../api.js';
import { difficultyLabel } from '../difficulty.js';
import { formatLongMove } from '../notation.js';
import { identifyOpening } from '../openings.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { playMoveSound, playCaptureSound, playSuccessSound } from '../sound.js';
import MechanicTutorialHelp from './MechanicTutorialHelp.jsx';

const PACE_OPTIONS = [
  { id: 'slow', label: 'Lenta (4s)', ms: 4000 },
  { id: 'normal', label: 'Normal (2.5s)', ms: 2500 },
  { id: 'fast', label: 'Rápida (1s)', ms: 1000 },
];

function randomLevel() {
  return Math.floor(Math.random() * 101);
}

function statusOf(chess) {
  if (chess.isCheckmate()) return 'checkmate';
  if (chess.isStalemate()) return 'stalemate';
  if (chess.isThreefoldRepetition()) return 'repetition';
  if (chess.isDraw()) return 'draw';
  if (chess.isCheck()) return 'check';
  return 'playing';
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
    return () => { stopRef.current = true; }; // si se desmonta, corta el loop en el próximo tick
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
    stopRef.current = false;
    setPhase('watching');

    runMatchLoop(wLevel, bLevel);
  }

  async function runMatchLoop(wLevel, bLevel) {
    const pace = PACE_OPTIONS.find((p) => p.id === paceId) || PACE_OPTIONS[1];

    while (!stopRef.current) {
      const chess = chessRef.current;
      if (chess.isGameOver()) {
        setPhase('over');
        return;
      }

      // Pausado: esperamos en cuotas cortas en vez de dormir todo de una,
      // para poder reaccionar apenas se reanude en vez de quedar "colgados"
      // hasta el final de una espera larga ya empezada.
      while (pausedRef.current && !stopRef.current) {
        await new Promise((r) => setTimeout(r, 150));
      }
      if (stopRef.current) return;

      const turn = chess.turn(); // 'w' | 'b'
      const level = turn === 'w' ? wLevel : bLevel;

      setThinking(true);
      let suggestion;
      try {
        suggestion = await api.analyzePosition(chess.fen(), level);
      } catch (e) {
        setError(e.message);
        setThinking(false);
        setPhase('setup');
        return;
      }
      setThinking(false);
      if (stopRef.current) return;
      if (!suggestion) {
        setPhase('over');
        return;
      }

      const applied = chess.move({ from: suggestion.from, to: suggestion.to, promotion: 'q' });
      if (!applied) {
        setError('El motor sugirió una jugada inválida — se cortó la partida ahí.');
        setPhase('over');
        return;
      }

      setFen(chess.fen());
      setLastMove({ from: applied.from, to: applied.to });
      setMoves((prev) => [...prev, { san: applied.san, from: applied.from, to: applied.to, captured: !!applied.captured, by: turn }]);

      if (applied.captured) playCaptureSound();
      else playMoveSound();

      if (chess.isGameOver()) {
        if (chess.isCheckmate()) playSuccessSound(); // el desenlace más dramático, suena sin importar quién ganó
        setPhase('over');
        return;
      }

      await new Promise((r) => setTimeout(r, pace.ms));
    }
  }

  function stopAndExit() {
    stopRef.current = true;
    onExit();
  }

  const status = statusOf(chessRef.current);
  const opening = identifyOpening(moves.map((m) => m.san));
  const resultText = {
    checkmate: `Jaque mate — ganaron las ${chessRef.current.turn() === 'w' ? 'negras' : 'blancas'}.`,
    stalemate: 'Ahogado — tablas.',
    repetition: 'Tablas por triple repetición.',
    draw: 'Tablas.',
  }[status];

  if (phase === 'setup') {
    return (
      <div className="menu">
        <button className="back-link" onClick={onExit}>← Volver al menú</button>

        <div className="menu-section">
          <span className="section-label">Modo espectador</span>
          <div className="combat-heading-row"><h2>Dos CPU, un tablero</h2><MechanicTutorialHelp tutorialId="spectator" /></div>
          <p className="hero-scope-note">
            Elige el nivel de cada bando (o dejalo al azar) y mira cómo juega el motor contra sí mismo, con
            pausas entre jugada y jugada para poder saborearlas.
          </p>

          {error && <p className="error-text">{error}</p>}

          <div className="spectator-side-setup">
            <div className="spectator-side-block">
              <h3>Blancas</h3>
              <label className="spectator-random-toggle">
                <input type="checkbox" checked={whiteRandom} onChange={(e) => setWhiteRandom(e.target.checked)} />
                Nivel aleatorio
              </label>
              {!whiteRandom && (
                <div className="difficulty-slider-row">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={whiteChoice}
                    onChange={(e) => setWhiteChoice(Number(e.target.value))}
                    className="difficulty-slider"
                  />
                  <div className="difficulty-readout">
                    <span className="difficulty-number">{whiteChoice}</span>
                    <span className="difficulty-word">{difficultyLabel(whiteChoice)}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="spectator-side-block">
              <h3>Negras</h3>
              <label className="spectator-random-toggle">
                <input type="checkbox" checked={blackRandom} onChange={(e) => setBlackRandom(e.target.checked)} />
                Nivel aleatorio
              </label>
              {!blackRandom && (
                <div className="difficulty-slider-row">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={blackChoice}
                    onChange={(e) => setBlackChoice(Number(e.target.value))}
                    className="difficulty-slider"
                  />
                  <div className="difficulty-readout">
                    <span className="difficulty-number">{blackChoice}</span>
                    <span className="difficulty-word">{difficultyLabel(blackChoice)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="time-control-row">
            <label className="time-control-label">Ritmo</label>
            <select value={paceId} onChange={(e) => setPaceId(e.target.value)} className="time-control-select">
              {PACE_OPTIONS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>

          <button type="button" className="primary-btn" style={{ width: '100%', marginTop: '0.9rem' }} onClick={startMatch}>
            Empezar
          </button>
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
          <Board fen={fen} lastMove={lastMove} orientation="white" />

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
