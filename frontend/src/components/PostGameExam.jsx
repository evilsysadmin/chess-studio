import { useEffect, useMemo, useRef, useState } from 'react';
import Board from './Board.jsx';
import PromotionModal from './PromotionModal.jsx';
import { api } from '../api.js';
import { chessFromFen } from '../chessRules.js';
import { matchesExpectedPuzzleMove } from '../puzzleMoveValidation.js';
import { buildPostGameExamPositions } from '../postGameExam.js';
import { buildShortCounterfactual } from '../postGameCounterfactual.js';
import './PostGameExam.css';

export default function PostGameExam({ history = [], humanColor = 'w', report = null, meta = {} }) {
  const positions = useMemo(
    () => buildPostGameExamPositions(history, humanColor, report, meta),
    [history, humanColor, meta, report],
  );
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [score, setScore] = useState(0);
  const [pendingPromotion, setPendingPromotion] = useState(null);
  const [counterfactual, setCounterfactual] = useState({ status: 'idle', line: [] });
  const counterfactualAbortRef = useRef(null);

  useEffect(() => () => {
    counterfactualAbortRef.current?.abort();
  }, []);

  if (!positions.length) return null;

  const current = positions[Math.min(index, positions.length - 1)];
  const localChess = chessFromFen(current.fen);
  const legalTargets = !attempt && selected && localChess
    ? localChess.moves({ square: selected, verbose: true }).map((move) => ({ to: move.to, san: move.san }))
    : [];
  const finished = started && index >= positions.length;

  function commitMove(from, to, promotion = null) {
    if (attempt || !current) return;
    const board = chessFromFen(current.fen);
    if (!board) return;
    let move = null;
    try {
      move = board.move({ from, to, promotion: promotion || 'q' });
    } catch {
      move = null;
    }
    setSelected(null);
    if (!move) return;
    const correct = matchesExpectedPuzzleMove(current.fen, current.solution[0], move);
    setAttempt({ correct, san: move.san, from: move.from, to: move.to });
    if (correct) setScore((value) => value + 1);
  }

  function handleSquareClick(square) {
    if (!started || finished || attempt || pendingPromotion || !localChess) return;
    if (!selected) {
      const piece = localChess.get(square);
      if (piece?.color === current.humanColor) setSelected(square);
      return;
    }
    if (square === selected) {
      setSelected(null);
      return;
    }
    const move = localChess.moves({ square: selected, verbose: true }).find((candidate) => candidate.to === square);
    if (!move) {
      const piece = localChess.get(square);
      setSelected(piece?.color === current.humanColor ? square : null);
      return;
    }
    if (move.promotion) {
      setPendingPromotion({ from: selected, to: square });
      return;
    }
    commitMove(selected, square);
  }

  function choosePromotion(code) {
    if (!pendingPromotion) return;
    const { from, to } = pendingPromotion;
    setPendingPromotion(null);
    commitMove(from, to, code);
  }

  async function revealCounterfactual() {
    if (!current || counterfactual.status === 'loading' || counterfactual.status === 'done') return;
    counterfactualAbortRef.current?.abort();
    const controller = new AbortController();
    counterfactualAbortRef.current = controller;
    setCounterfactual({ status: 'loading', line: [] });
    try {
      const result = await buildShortCounterfactual({
        fen: current.fen,
        suggested: current.suggested,
        analyzePosition: (fen, level, options) => api.analyzePosition(fen, level, options),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setCounterfactual(result?.line?.length
        ? { status: 'done', line: result.line }
        : { status: 'unavailable', line: [] });
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') return;
      setCounterfactual({ status: 'unavailable', line: [] });
    }
  }

  function nextPosition() {
    counterfactualAbortRef.current?.abort();
    const next = index + 1;
    setSelected(null);
    setAttempt(null);
    setPendingPromotion(null);
    setCounterfactual({ status: 'idle', line: [] });
    setIndex(next);
  }

  if (!started) {
    return (
      <section className="post-game-exam post-game-exam-intro" data-post-game-exam="ready">
        <div>
          <span className="eyebrow">EXAMEN // SIN PISTAS</span>
          <h3>¿Lo ves ahora sin que Matthias te lo chive?</h3>
          <p>{positions.length} posición{positions.length === 1 ? '' : 'es'} crítica{positions.length === 1 ? '' : 's'} real{positions.length === 1 ? '' : 'es'} de esta partida. No mostramos tu jugada ni la alternativa hasta que respondas.</p>
        </div>
        <button type="button" className="primary-btn" onClick={() => setStarted(true)}>Hacer examen</button>
      </section>
    );
  }

  if (finished) {
    return (
      <section className="post-game-exam post-game-exam-finished" data-post-game-exam="finished" role="status">
        <span className="eyebrow">EXAMEN // TERMINADO</span>
        <h3>{score}/{positions.length} a la primera</h3>
        <p>{score === positions.length ? 'Bien. Esta vez los cadáveres han servido para algo.' : 'Los fallos ya están guardados como material de entrenamiento personal cuando cumplen el gate táctico.'}</p>
      </section>
    );
  }

  return (
    <section className="post-game-exam" data-post-game-exam="active" data-exam-position={`${index + 1}/${positions.length}`}>
      <div className="post-game-exam-heading">
        <div>
          <span className="eyebrow">EXAMEN // POSICIÓN {index + 1} DE {positions.length}</span>
          <h3>Tu turno. Encuentra la jugada.</h3>
        </div>
        <strong>Aciertos · {score}</strong>
      </div>

      <div className="post-game-exam-workspace">
        <div className="post-game-exam-board">
          <Board
            fen={current.fen}
            onSquareClick={handleSquareClick}
            selectedSquare={selected}
            legalTargets={legalTargets}
            orientation={current.humanColor === 'b' ? 'black' : 'white'}
          />
        </div>
        <aside className={`post-game-exam-result${attempt ? ' is-revealed' : ''}`} aria-live="polite">
          {!attempt ? (
            <>
              <b>Sin pista.</b>
              <span>Ni flecha, ni SAN, ni “por aquí quizá”. Calcula y mueve.</span>
            </>
          ) : (
            <>
              <b>{attempt.correct ? '✓ Correcto.' : `✗ ${attempt.san} no era.`}</b>
              <span>En la partida jugaste <strong>{current.played}</strong>. La alternativa era <strong>{current.suggested}</strong>.</span>
              <small>Jugada {current.moveNumber} · pérdida estimada del error original: ~{current.loss} cp.</small>

              <div className="post-game-counterfactual" data-counterfactual-status={counterfactual.status}>
                {counterfactual.status === 'idle' && (
                  <button type="button" className="secondary-btn" onClick={() => void revealCounterfactual()}>
                    Ver línea corta del motor
                  </button>
                )}
                {counterfactual.status === 'loading' && <small>Calculando sólo 2–3 medias jugadas desde la posición real…</small>}
                {counterfactual.status === 'done' && (
                  <>
                    <b>Si jugabas {current.suggested}</b>
                    <span>{counterfactual.line.map((move) => move.san).join(' · ')}</span>
                    <small>Línea corta recalculada desde el FEN real. Más allá de estas jugadas no promete nada.</small>
                  </>
                )}
                {counterfactual.status === 'unavailable' && <small>No se pudo extender la variante ahora mismo; la alternativa original del análisis sigue siendo válida.</small>}
              </div>

              <button type="button" className="primary-btn" onClick={nextPosition}>
                {index + 1 < positions.length ? 'Siguiente posición' : 'Ver resultado'}
              </button>
            </>
          )}
        </aside>
      </div>
      {pendingPromotion && <PromotionModal onChoose={choosePromotion} />}
    </section>
  );
}
