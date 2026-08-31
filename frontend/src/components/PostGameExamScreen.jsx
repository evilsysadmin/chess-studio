import { useEffect, useMemo, useState } from 'react';
import Board from './Board.jsx';
import PromotionModal from './PromotionModal.jsx';
import { chessFromFen } from '../chessRules.js';
import { matchesExpectedPuzzleMove } from '../puzzleMoveValidation.js';
import { recordPersonalPuzzleResult } from '../personalPuzzles.js';
import { clearPostGameExam, postGameExamPuzzles } from '../postGameExam.js';
import { playMoveSound, playSuccessSound } from '../sound.js';
import { useEscapeToClose } from '../useEscapeToClose.js';

const SAFE_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export default function PostGameExamScreen({ onExit }) {
  const [puzzles] = useState(() => postGameExamPuzzles());
  const [index, setIndex] = useState(0);
  const [fen, setFen] = useState(() => puzzles[0]?.fen || SAFE_FEN);
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState('playing');
  const [feedback, setFeedback] = useState(null);
  const [hadError, setHadError] = useState(false);
  const [pendingPromotion, setPendingPromotion] = useState(null);

  function exitExam() {
    clearPostGameExam();
    onExit?.();
  }

  useEscapeToClose(exitExam);

  const puzzle = puzzles[index] || null;
  const board = useMemo(() => chessFromFen(fen), [fen]);
  const humanColor = useMemo(() => chessFromFen(puzzle?.fen)?.turn() || 'w', [puzzle]);
  const legalTargets = selected && board && status === 'playing'
    ? board.moves({ square: selected, verbose: true }).map((move) => ({ to: move.to, san: move.san }))
    : [];

  useEffect(() => {
    if (!puzzle) return;
    setFen(puzzle.fen);
    setSelected(null);
    setStatus('playing');
    setFeedback(null);
    setHadError(false);
    setPendingPromotion(null);
  }, [puzzle?.id]);

  if (puzzles.length < 2 || !puzzle) {
    return (
      <div className="tutorial-shell puzzle-screen post-game-exam-screen">
        <button className="back-link" onClick={exitExam}>← Volver</button>
        <div className="menu-section ui-state ui-state-error" role="alert">
          <b>El examen ya no está disponible</b>
          <span>Faltan posiciones de la autopsia en tu banco personal. No las sustituimos por ejercicios ajenos.</span>
        </div>
      </div>
    );
  }

  function attemptMove(from, to, promotion = null) {
    if (status !== 'playing') return;
    const attempt = chessFromFen(fen);
    if (!attempt) return;
    let move = null;
    try { move = attempt.move({ from, to, promotion: promotion || 'q' }); } catch { move = null; }
    setSelected(null);
    if (!move) return;

    const expected = puzzle.solution?.[0];
    if (!expected || !matchesExpectedPuzzleMove(fen, expected, move)) {
      setHadError(true);
      setFeedback('Incorrecta. No hay pista: vuelve a leer jaques, capturas y amenazas y prueba otra vez.');
      playMoveSound();
      return;
    }

    setFen(attempt.fen());
    setStatus('solved');
    setFeedback(hadError ? 'Resuelta, pero no limpia. El fallo queda en el expediente.' : 'Resuelta limpia. Esa sí era.');
    recordPersonalPuzzleResult(puzzle.id, { solved: true, clean: !hadError });
    playSuccessSound();
  }

  function handleSquareClick(square) {
    if (!board || status !== 'playing' || pendingPromotion) return;
    if (!selected) {
      const piece = board.get(square);
      if (piece?.color === humanColor) setSelected(square);
      return;
    }
    if (square === selected) {
      setSelected(null);
      return;
    }
    const move = board.moves({ square: selected, verbose: true }).find((candidate) => candidate.to === square);
    if (!move) {
      const piece = board.get(square);
      if (piece?.color === humanColor) setSelected(square);
      else setSelected(null);
      return;
    }
    if (move.promotion) {
      setPendingPromotion({ from: selected, to: square });
      return;
    }
    attemptMove(selected, square);
  }

  function choosePromotion(code) {
    if (!pendingPromotion) return;
    const { from, to } = pendingPromotion;
    setPendingPromotion(null);
    attemptMove(from, to, code);
  }

  function advance() {
    if (status !== 'solved') return;
    if (index >= puzzles.length - 1) {
      exitExam();
      return;
    }
    setIndex((current) => current + 1);
  }

  return (
    <div className="tutorial-shell puzzle-screen post-game-exam-screen">
      <button className="back-link" onClick={exitExam}>← Abandonar examen</button>
      <div className="menu-section">
        <span className="section-label">Autopsia · sin ruedines</span>
        <h2>Examen postpartida</h2>
        <p className="hint-text">Posición {index + 1}/{puzzles.length}. Es una posición crítica real de la partida que acabas de revisar. No mostramos tu jugada, la alternativa del motor ni la solución hasta que la encuentres tú.</p>
      </div>

      <div className="puzzle-training-workspace">
        <div className="board-column puzzle-board-column">
          <div className={`status-line ${status === 'solved' ? 'success' : ''}`}>
            {status === 'solved' ? 'Posición resuelta' : 'Tu turno · encuentra la mejor jugada'}
          </div>
          <Board
            fen={board ? fen : SAFE_FEN}
            onSquareClick={handleSquareClick}
            selectedSquare={selected}
            legalTargets={legalTargets}
            orientation={humanColor === 'b' ? 'black' : 'white'}
          />
          {feedback ? <p className={status === 'solved' ? 'hint-text' : 'error-text'}>{feedback}</p> : null}
          <div className="game-controls">
            {status === 'solved' ? (
              <button className="primary-btn" onClick={advance}>{index >= puzzles.length - 1 ? 'Terminar examen' : 'Siguiente posición →'}</button>
            ) : null}
          </div>
        </div>

        <aside className="tutorial-text puzzle-friendly-info puzzle-coach-panel" aria-label="Examen postpartida">
          <div className="puzzle-coach-chrome"><span className="eyebrow">EXAMEN // AUTOPSIA REAL</span><span className={`puzzle-coach-state ${status === 'solved' ? 'is-success' : ''}`}>{status === 'solved' ? 'RESUELTO' : 'SIN PISTA'}</span></div>
          <h2>¿Qué jugarías ahora?</h2>
          {status === 'playing' ? (
            <p>Calcula como si la partida volviera a estar viva. No hay botón de solución, pista, histórico ni variante generada que te saque del apuro.</p>
          ) : (
            <>
              <p><b>Respuesta:</b> {puzzle.suggested || puzzle.solution?.[0]}.</p>
              <p className="hint-text">En la partida jugaste {puzzle.played || 'otra cosa'}{Number.isFinite(Number(puzzle.loss)) ? ` y la autopsia midió una pérdida aproximada de ${Number(puzzle.loss)} cp` : ''}.</p>
            </>
          )}
          <p className="hint-text">Juegas con <b>{humanColor === 'w' ? 'blancas' : 'negras'}</b>. Un fallo no revela nada: sólo hace que la resolución deje de contar como limpia.</p>
        </aside>
      </div>
      {pendingPromotion ? <PromotionModal onChoose={choosePromotion} /> : null}
    </div>
  );
}
