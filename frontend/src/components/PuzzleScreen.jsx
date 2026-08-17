import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import Board from './Board.jsx';
import { randomPuzzle } from '../puzzles.js';
import { playMoveSound, playCaptureSound, playSuccessSound } from '../sound.js';
import { incrementPuzzlesSolved, loadPuzzleStreak, incrementPuzzleStreak, resetPuzzleStreak, loadBestPuzzleStreak } from '../puzzleStats.js';
import { puzzleRetryCost } from '../tournament.js';
import { useEscapeToClose } from '../useEscapeToClose.js';

const KIND_LABELS = { mate1: 'Mate en 1', mate2: 'Mate en 2', material: 'Gana material' };

// Tiempo (ms) que se espera antes de aplicar la respuesta forzada del
// rival, para que se note que hubo dos jugadas separadas.
const REPLY_DELAY_MS = 550;

export default function PuzzleScreen({ onExit, points = 0, onSpendPoints }) {
  useEscapeToClose(onExit);
  const [puzzle, setPuzzle] = useState(() => randomPuzzle());
  const [fen, setFen] = useState(puzzle.fen);
  const [stepIndex, setStepIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState('playing'); // 'playing' | 'solved' | 'revealed'
  const [feedback, setFeedback] = useState(null);
  const [solvedCount, setSolvedCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [streak, setStreak] = useState(() => loadPuzzleStreak());
  const [bestStreak, setBestStreak] = useState(() => loadBestPuzzleStreak());
  const [wrongThisPuzzle, setWrongThisPuzzle] = useState(false); // hubo un fallo SIN proteger en el intento actual
  const [retryOffer, setRetryOffer] = useState(false); // mostrando el prompt de "¿pagar para proteger la racha?"
  const replyTimeout = useRef(null);

  const humanColor = useMemo(() => new Chess(puzzle.fen).turn(), [puzzle]);

  useEffect(() => {
    setFen(puzzle.fen);
    setStepIndex(0);
    setSelected(null);
    setStatus('playing');
    setFeedback(null);
    setBusy(false);
    setWrongThisPuzzle(false);
    setRetryOffer(false);
  }, [puzzle]);

  useEffect(() => () => {
    if (replyTimeout.current) clearTimeout(replyTimeout.current);
  }, []);

  const localChess = useMemo(() => {
    const c = new Chess();
    c.load(fen);
    return c;
  }, [fen]);

  const legalTargets = selected
    ? localChess.moves({ square: selected, verbose: true }).map((m) => ({ to: m.to, san: m.san }))
    : [];

  function newPuzzle() {
    setPuzzle(randomPuzzle(puzzle.id));
  }

  function handleSquareClick(square) {
    if (status !== 'playing' || busy || retryOffer) return;

    if (!selected) {
      const piece = localChess.get(square);
      if (piece && piece.color === humanColor) setSelected(square);
      return;
    }
    if (square === selected) {
      setSelected(null);
      return;
    }
    const move = localChess.moves({ square: selected, verbose: true }).find((m) => m.to === square);
    if (!move) {
      const piece = localChess.get(square);
      if (piece && piece.color === humanColor) setSelected(square);
      else setSelected(null);
      return;
    }
    attemptMove(selected, square);
  }

  function attemptMove(from, to) {
    if (retryOffer) return; // hay que responder el prompt antes de seguir jugando
    const attempt = new Chess();
    attempt.load(fen);
    let move;
    try {
      move = attempt.move({ from, to, promotion: 'q' });
    } catch (e) {
      move = null;
    }
    setSelected(null);
    if (!move) return;

    const expected = puzzle.solution[stepIndex];
    if (move.san !== expected) {
      // Primer fallo de este intento, con una racha real para proteger —
      // se ofrece pagar en vez de romperla directamente.
      if (!wrongThisPuzzle && streak > 0) {
        setRetryOffer(true);
        return;
      }
      setFeedback('Esa no era la jugada — ¡prueba de nuevo!');
      setWrongThisPuzzle(true);
      return;
    }

    setFeedback(null);
    if (move.captured) playCaptureSound();
    else playMoveSound();
    const newFen = attempt.fen();
    setFen(newFen);

    const nextIndex = stepIndex + 1;
    if (nextIndex >= puzzle.solution.length) {
      setStatus('solved');
      setSolvedCount((n) => n + 1);
      incrementPuzzlesSolved();
      if (wrongThisPuzzle) {
        resetPuzzleStreak();
        setStreak(0);
      } else {
        setStreak(incrementPuzzleStreak());
        setBestStreak(loadBestPuzzleStreak());
      }
      playSuccessSound();
      return;
    }

    // Hay una respuesta forzada del rival antes de que vuelva a ser tu turno.
    setBusy(true);
    const replySan = puzzle.solution[nextIndex];
    replyTimeout.current = setTimeout(() => {
      const withReply = new Chess();
      withReply.load(newFen);
      withReply.move(replySan);
      setFen(withReply.fen());
      playMoveSound();
      setStepIndex(nextIndex + 1);
      setBusy(false);
    }, REPLY_DELAY_MS);
  }

  function payToProtectStreak() {
    const cost = puzzleRetryCost(streak);
    onSpendPoints?.(cost);
    setRetryOffer(false);
    setFeedback(`Protegido por ${cost} puntos — sigue intentando, la racha sigue en pie.`);
  }

  function declineProtection() {
    setRetryOffer(false);
    setWrongThisPuzzle(true);
    setFeedback('Esa no era la jugada — ¡prueba de nuevo! (esta racha ya se rompió)');
  }

  function revealSolution() {
    if (replyTimeout.current) clearTimeout(replyTimeout.current);
    const c = new Chess();
    c.load(puzzle.fen);
    for (const san of puzzle.solution) c.move(san);
    setFen(c.fen());
    setStepIndex(puzzle.solution.length);
    setStatus('revealed');
    setBusy(false);
    setRetryOffer(false);
    if (streak > 0) {
      resetPuzzleStreak();
      setStreak(0);
    }
  }

  return (
    <div className="tutorial-shell">
      <button className="back-link" onClick={onExit}>← Volver al menú</button>
      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', justifyContent: 'center', width: '100%' }}>
        <div className="board-column">
          <div className={`status-line ${status === 'solved' ? 'success' : ''}`}>
            {status === 'solved' && '¡Resuelto!'}
            {status === 'revealed' && 'Esta era la solución'}
            {status === 'playing' && (busy ? 'El rival responde…' : 'Tu turno')}
          </div>
          <Board
            fen={fen}
            onSquareClick={handleSquareClick}
            selectedSquare={selected}
            legalTargets={legalTargets}
            orientation={humanColor === 'b' ? 'black' : 'white'}
          />
          {feedback && <p className="error-text" style={{ marginTop: '0.5rem' }}>{feedback}</p>}
          {retryOffer && (
            <div className="menu-section" style={{ marginTop: '0.6rem', padding: '0.8rem' }}>
              <p className="hint-text" style={{ margin: '0 0 0.5rem' }}>
                Esa no era la jugada — tienes una racha de {streak}. ¿Pagas {puzzleRetryCost(streak)} puntos
                para que este fallo no la rompa?
              </p>
              <div className="game-controls">
                <button
                  className="primary-btn"
                  disabled={points < puzzleRetryCost(streak)}
                  onClick={payToProtectStreak}
                >
                  Pagar {puzzleRetryCost(streak)} pts y proteger la racha
                </button>
                <button className="secondary-btn" onClick={declineProtection}>
                  No, sigo sin proteger
                </button>
              </div>
            </div>
          )}
          <div className="game-controls">
            {status === 'playing' && (
              <button className="secondary-btn" onClick={revealSolution}>Ver solución</button>
            )}
            <button className="primary-btn" onClick={newPuzzle}>Siguiente puzzle</button>
          </div>
        </div>

        <div className="tutorial-text">
          <span className="eyebrow">{KIND_LABELS[puzzle.kind] || 'Puzzle'} · resueltos: {solvedCount}</span>
          <h2>{puzzle.title}</h2>
          <p>{puzzle.description}</p>
          <p className="hint-text" style={{ marginTop: '0.5rem' }}>
            Racha actual: <b>{streak}</b> · mejor racha: <b>{bestStreak}</b>
          </p>
          <p className="hint-text" style={{ marginTop: '0.75rem' }}>
            Juegas con {humanColor === 'w' ? 'blancas' : 'negras'}. Elige la pieza y la casilla de destino como en una
            partida normal — si no es la jugada correcta, el tablero no cambia y puedes volver a intentarlo.
          </p>
        </div>
      </div>
    </div>
  );
}
