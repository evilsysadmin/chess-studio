import React, { useEffect, useMemo, useRef, useState } from 'react';
import MechanicTutorialHelp from './MechanicTutorialHelp.jsx';
import { Chess } from 'chess.js';
import Board from './Board.jsx';
import { PUZZLES, randomPuzzle } from '../puzzles.js';
import { loadPersonalPuzzles, personalPuzzlesForFilter, personalTrainingSummary, randomPersonalPuzzle, recordPersonalPuzzleResult } from '../personalPuzzles.js';
import { dailyPuzzle, markDailySolved, currentDailyStreak } from '../dailyChallenge.js';
import { playMoveSound, playCaptureSound, playSuccessSound } from '../sound.js';
import { incrementPuzzlesSolved, loadPuzzleStreak, incrementPuzzleStreak, resetPuzzleStreak, loadBestPuzzleStreak } from '../puzzleStats.js';
import { puzzleRetryCost } from '../tournament.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { recordPuzzleRush } from '../career.js';
import { lastDailyCells } from '../careerVisuals.js';
import { checkAchievements } from '../achievements.js';

const KIND_LABELS = { mate1: 'Mate en 1', mate2: 'Mate en 2', material: 'Gana material', personal: 'Tu crimen' };

// Tiempo (ms) que se espera antes de aplicar la respuesta forzada del
// rival, para que se note que hubo dos jugadas separadas.
const REPLY_DELAY_MS = 550;

export default function PuzzleScreen({ onExit, points = 0, onSpendPoints, initialSource = 'curated', rushMode = false, initialFilter = null }) {
  useEscapeToClose(onExit);
  const [personalPuzzles, setPersonalPuzzles] = useState(() => loadPersonalPuzzles());
  const filteredInitialPersonal = personalPuzzlesForFilter(initialFilter);
  const resolvedInitialSource = initialSource === 'personal' && filteredInitialPersonal.length === 0 ? 'curated' : initialSource;
  const [source, setSource] = useState(resolvedInitialSource); // curated | personal | daily
  const [puzzle, setPuzzle] = useState(() => resolvedInitialSource === 'personal' ? (randomPersonalPuzzle(null, initialFilter) || randomPuzzle()) : resolvedInitialSource === 'daily' ? dailyPuzzle(PUZZLES) : randomPuzzle());
  const [dailyStats, setDailyStats] = useState(() => currentDailyStreak());
  const [fen, setFen] = useState(puzzle.fen);
  const [stepIndex, setStepIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState('playing'); // 'playing' | 'solved' | 'revealed'
  const [feedback, setFeedback] = useState(null);
  const [solvedCount, setSolvedCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [streak, setStreak] = useState(() => loadPuzzleStreak());
  const [bestStreak, setBestStreak] = useState(() => loadBestPuzzleStreak());
  const [wrongThisPuzzle, setWrongThisPuzzle] = useState(false); // fallo que rompe racha (si no se protege)
  const [personalHadError, setPersonalHadError] = useState(false); // cualquier fallo: mide resolución limpia real
  const [retryOffer, setRetryOffer] = useState(false); // mostrando el prompt de "¿pagar para proteger la racha?"
  const replyTimeout = useRef(null);
  const rushNextTimeout = useRef(null);
  const rushSavedRef = useRef(false);
  const [rushSeconds, setRushSeconds] = useState(rushMode ? 180 : null);
  const [rushEnded, setRushEnded] = useState(false);

  const humanColor = useMemo(() => new Chess(puzzle.fen).turn(), [puzzle]);
  const personalStats = useMemo(() => personalTrainingSummary(), [personalPuzzles]);
  const filteredPersonalCount = useMemo(() => initialFilter?.opening ? personalPuzzles.filter((p) => p.opening === initialFilter.opening).length : personalPuzzles.length, [personalPuzzles, initialFilter]);
  const dailyCells = useMemo(() => lastDailyCells(dailyStats.solvedDates, 28), [dailyStats]);

  useEffect(() => {
    setFen(puzzle.fen);
    setStepIndex(0);
    setSelected(null);
    setStatus('playing');
    setFeedback(null);
    setBusy(false);
    setWrongThisPuzzle(false);
    setPersonalHadError(false);
    setRetryOffer(false);
  }, [puzzle]);

  useEffect(() => () => {
    if (replyTimeout.current) clearTimeout(replyTimeout.current);
    if (rushNextTimeout.current) clearTimeout(rushNextTimeout.current);
  }, []);

  useEffect(() => {
    if (!rushMode || rushEnded) return undefined;
    const timer = setInterval(() => {
      setRushSeconds((s) => {
        if (s <= 1) { setRushEnded(true); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [rushMode, rushEnded]);

  useEffect(() => {
    if (!rushMode || !rushEnded || rushSavedRef.current) return;
    rushSavedRef.current = true;
    recordPuzzleRush(solvedCount);
  }, [rushMode, rushEnded, solvedCount]);

  const localChess = useMemo(() => {
    const c = new Chess();
    c.load(fen);
    return c;
  }, [fen]);

  const legalTargets = selected
    ? localChess.moves({ square: selected, verbose: true }).map((m) => ({ to: m.to, san: m.san }))
    : [];

  function choosePuzzle(nextSource, excludeId = null) {
    if (nextSource === 'personal') return randomPersonalPuzzle(excludeId, initialFilter) || randomPuzzle(excludeId);
    if (nextSource === 'daily') return dailyPuzzle(PUZZLES);
    return randomPuzzle(excludeId);
  }

  function changeSource(nextSource) {
    if (nextSource === 'personal' && filteredPersonalCount === 0) return;
    setSource(nextSource);
    setPuzzle(choosePuzzle(nextSource));
  }

  function newPuzzle() {
    setPersonalPuzzles(loadPersonalPuzzles());
    setPuzzle(choosePuzzle(source, puzzle.id));
  }

  function handleSquareClick(square) {
    if (status !== 'playing' || busy || retryOffer || rushEnded) return;

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
      setPersonalHadError(true);
      if (rushMode) {
        setFeedback('Incorrecta. Siguiente caso: el reloj no negocia.');
        if (source === 'personal') recordPersonalPuzzleResult(puzzle.id, { solved: false, clean: false });
        setWrongThisPuzzle(true);
        rushNextTimeout.current = setTimeout(() => { setPuzzle(choosePuzzle(source, puzzle.id)); setFeedback(null); }, 450);
        return;
      }
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
      if (source === 'daily' && puzzle.dailyKey) {
        setDailyStats(markDailySolved(puzzle.dailyKey));
        checkAchievements();
      }
      if (wrongThisPuzzle) {
        resetPuzzleStreak();
        setStreak(0);
      } else {
        setStreak(incrementPuzzleStreak());
        setBestStreak(loadBestPuzzleStreak());
      }
      if (source === 'personal') {
        recordPersonalPuzzleResult(puzzle.id, { solved: true, clean: !personalHadError });
        setPersonalPuzzles(loadPersonalPuzzles());
      }
      playSuccessSound();
      if (rushMode) {
        rushNextTimeout.current = setTimeout(() => setPuzzle(choosePuzzle(source, puzzle.id)), 350);
      }
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
    if (source === 'personal') {
      recordPersonalPuzzleResult(puzzle.id, { solved: false, clean: false });
      setPersonalPuzzles(loadPersonalPuzzles());
    }
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
      {!rushMode && <div className="puzzle-source-picker" role="group" aria-label="Tipo de puzzle">
        <button className={source === 'curated' ? 'primary-btn' : 'secondary-btn'} onClick={() => changeSource('curated')}>Puzzles clásicos</button>
        <button className={source === 'personal' ? 'primary-btn' : 'secondary-btn'} disabled={filteredPersonalCount === 0} onClick={() => changeSource('personal')}>
          {initialFilter?.opening ? `Crímenes · ${initialFilter.opening} (${filteredPersonalCount})` : `Tus crímenes (${personalPuzzles.length})`}
        </button>
        <button className={source === 'daily' ? 'primary-btn' : 'secondary-btn'} onClick={() => changeSource('daily')}>Desafío diario</button>
      </div>}
      {rushMode && <div className={`puzzle-rush-banner ${rushSeconds <= 30 ? 'danger' : ''}`}><b>PUZZLE RUSH PERSONAL</b><span>{Math.floor((rushSeconds || 0) / 60)}:{String((rushSeconds || 0) % 60).padStart(2, '0')} · {solvedCount} aciertos</span></div>}
      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', justifyContent: 'center', width: '100%' }}>
        <div className="board-column">
          <div className={`status-line ${status === 'solved' ? 'success' : ''}`}>
            {status === 'solved' && '¡Resuelto!'}
            {status === 'revealed' && 'Esta era la solución'}
            {status === 'playing' && (rushEnded ? `Tiempo. ${solvedCount} aciertos.` : busy ? 'El rival responde…' : 'Tu turno')}
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
            {!rushMode && status === 'playing' && (
              <button className="secondary-btn" onClick={revealSolution}>Ver solución</button>
            )}
            {!rushMode && source !== 'daily' && <button className="primary-btn" onClick={newPuzzle}>Siguiente puzzle</button>}
            {rushMode && rushEnded && <button className="primary-btn" onClick={onExit}>Guardar marca y salir</button>}
          </div>
        </div>

        <div className="tutorial-text">
          <span className="eyebrow">{KIND_LABELS[puzzle.kind] || 'Puzzle'} · resueltos: {solvedCount}</span>
          <div className="combat-heading-row"><h2>{puzzle.title}</h2><MechanicTutorialHelp tutorialId="puzzles" /></div>
          <p>{puzzle.description}</p>
          {source === 'personal' && (
            <p className="hint-text personal-puzzle-note">
              ☠ Nació de una de tus propias autopsias. La máquina guarda rencor documental.{initialFilter?.opening ? ` Filtro némesis: ${initialFilter.opening}.` : ''} {personalStats.attempts ? ` Entrenamiento: ${personalStats.cleanSolves}/${personalStats.attempts} limpias${personalStats.cleanRate !== null ? ` · ${personalStats.cleanRate}%` : ''}.` : ''}
            </p>
          )}
          {source === 'daily' && (
            <div className="daily-challenge-panel">
              <p className="hint-text daily-challenge-note">
                📅 Reto de hoy · racha diaria: <b>{dailyStats.streak || 0}</b> · mejor: <b>{dailyStats.bestStreak || 0}</b>
                {dailyStats.solvedDates?.includes(puzzle.dailyKey) ? ' · ya resuelto hoy' : ''}
              </p>
              <div className="daily-calendar" aria-label="Últimos 28 días de desafío diario">
                {dailyCells.map((cell) => <span key={cell.key} className={`${cell.solved ? 'solved' : ''} ${cell.today ? 'today' : ''}`} title={`${cell.key}${cell.solved ? ' · resuelto' : ' · pendiente/no resuelto'}`}><small>{cell.weekday}</small><b>{cell.day}</b></span>)}
              </div>
              <small className="hint-text">Últimos 28 días. Solo se marca un día cuando el puzzle diario queda realmente resuelto.</small>
            </div>
          )}
          <p className="hint-text" style={{ marginTop: '0.5rem' }}>
            Racha de puzzles: <b>{streak}</b> · mejor racha: <b>{bestStreak}</b>
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
