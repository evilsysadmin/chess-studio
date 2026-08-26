import { useEffect, useMemo, useRef, useState } from 'react';
import MechanicTutorialHelp from './MechanicTutorialHelp.jsx';
import { Chess } from 'chess.js';
import Board from './Board.jsx';
import { PUZZLES, randomPuzzle } from '../puzzles.js';
import { loadPersonalPuzzles, matchesPersonalPuzzleFilter, personalPuzzlesForFilter, personalTrainingSummary, randomPersonalPuzzle, recordPersonalPuzzleResult } from '../personalPuzzles.js';
import { dailyChallengeBrief, dailyPuzzle, markDailySolved, currentDailyStreak } from '../dailyChallenge.js';
import { playMoveSound, playCaptureSound, playSuccessSound } from '../sound.js';
import { incrementPuzzlesSolved, loadPuzzleStreak, incrementPuzzleStreak, resetPuzzleStreak, loadBestPuzzleStreak } from '../puzzleStats.js';
import { puzzleRetryCost } from '../tournament.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { recordPuzzleRush } from '../career.js';
import { lastDailyCells } from '../careerVisuals.js';
import { checkAchievements } from '../achievements.js';
import { matchesExpectedPuzzleMove } from '../puzzleMoveValidation.js';
import { buildPuzzleReveal } from '../puzzleReveal.js';

const KIND_LABELS = { mate1: 'Mate en 1', mate2: 'Mate en 2', material: 'Gana material', personal: 'Tu crimen' };
const RECENT_CURATED_LIMIT = 5;

// Tiempo (ms) que se espera antes de aplicar la respuesta forzada del
// rival, para que se note que hubo dos jugadas separadas.
const REPLY_DELAY_MS = 550;

export default function PuzzleScreen({ onExit, points = 0, onSpendPoints, initialSource = 'curated', rushMode = false, initialFilter = null, dailySlot = 'tactic' }) {
  useEscapeToClose(onExit);
  const [personalPuzzles, setPersonalPuzzles] = useState(() => loadPersonalPuzzles());
  const filteredInitialPersonal = personalPuzzlesForFilter(initialFilter);
  const resolvedInitialSource = initialSource === 'personal' && filteredInitialPersonal.length === 0 ? 'curated' : initialSource;
  const [source, setSource] = useState(resolvedInitialSource); // curated | personal | daily
  const [puzzle, setPuzzle] = useState(() => resolvedInitialSource === 'personal' ? (randomPersonalPuzzle(null, initialFilter) || randomPuzzle()) : resolvedInitialSource === 'daily' ? dailyPuzzle(PUZZLES, new Date(), dailySlot) : randomPuzzle());
  const [recentCuratedIds, setRecentCuratedIds] = useState([]);
  const [dailyStats, setDailyStats] = useState(() => currentDailyStreak());
  const [achievementUnlocked, setAchievementUnlocked] = useState(null);
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
  const filteredPersonalCount = useMemo(() => personalPuzzles.filter((p) => matchesPersonalPuzzleFilter(p, initialFilter)).length, [personalPuzzles, initialFilter]);
  const dailyCells = useMemo(() => lastDailyCells(dailyStats.solvedDates, 28), [dailyStats]);
  const dailyBrief = useMemo(() => dailyChallengeBrief(dailyStats, puzzle.dailyKey), [dailyStats, puzzle.dailyKey]);
  const revealGuide = useMemo(() => buildPuzzleReveal(puzzle), [puzzle]);

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
    setAchievementUnlocked(null);
  }, [puzzle]);

  useEffect(() => {
    if (source !== 'curated' || !puzzle?.id) return;
    setRecentCuratedIds((ids) => [...new Set([...ids, puzzle.id])].slice(-RECENT_CURATED_LIMIT));
  }, [puzzle?.id, source]);

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
    if (nextSource === 'daily') return dailyPuzzle(PUZZLES, new Date(), dailySlot);
    const recent = [...recentCuratedIds, excludeId].filter(Boolean);
    return randomPuzzle(recent, puzzle?.kind);
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
    if (!matchesExpectedPuzzleMove(fen, expected, move)) {
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
        setDailyStats(markDailySolved(puzzle.dailyKey, { clean: !personalHadError, slot: puzzle.dailySlot || dailySlot }));
        const achievementResult = checkAchievements();
        if (achievementResult.newAchievements.length) {
          setAchievementUnlocked({ first: achievementResult.newAchievements[0], count: achievementResult.newAchievements.length });
        }
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
    // Mismo lenguaje que Replay/Autopsia: posición tras la jugada realizada,
    // origen y destino rojos (con pieza fantasma en origen), y alternativa
    // del motor encuadrada en azul sobre esas mismas coordenadas.
    setFen(revealGuide.displayFen);
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
      {!rushMode && <div className="puzzle-source-picker friendly-tabs" role="group" aria-label="Tipo de puzzle">
        <button className={source === 'curated' ? 'primary-btn' : 'secondary-btn'} onClick={() => changeSource('curated')}>Puzzles clásicos</button>
        <button className={source === 'personal' ? 'primary-btn' : 'secondary-btn'} disabled={filteredPersonalCount === 0} onClick={() => changeSource('personal')}>
          {initialFilter?.label ? `Crímenes · ${initialFilter.label} (${filteredPersonalCount})` : initialFilter?.opening ? `Crímenes · ${initialFilter.opening} (${filteredPersonalCount})` : `Tus crímenes (${personalPuzzles.length})`}
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
            mistakeMove={status === 'revealed' ? revealGuide.played : null}
            hintMove={status === 'revealed' ? revealGuide.preferred : null}
          />
          {status === 'revealed' && (
            <div className="puzzle-solution-guide" role="status" aria-live="polite">
              {revealGuide.played && (
                <span className="puzzle-solution-move is-played"><i aria-hidden="true" />Tu jugada <b>{revealGuide.played.san}</b><small>{revealGuide.played.from} → {revealGuide.played.to}</small></span>
              )}
              {revealGuide.preferred && (
                <span className="puzzle-solution-move is-preferred"><i aria-hidden="true" />Mejor jugada <b>{revealGuide.preferred.san}</b><small>{revealGuide.preferred.from} → {revealGuide.preferred.to}</small></span>
              )}
              {revealGuide.line.length > 1 && <span className="puzzle-solution-line">Línea: <b>{revealGuide.line.join(' · ')}</b></span>}
            </div>
          )}
          {feedback && <p className="error-text" style={{ marginTop: '0.5rem' }}>{feedback}</p>}
          {retryOffer && (
            <div className="menu-section" style={{ marginTop: '0.6rem', padding: '0.8rem' }}>
              <p className="hint-text" style={{ margin: '0 0 0.5rem' }}>
                Esa no era la jugada — tienes una racha de {streak}. ¿Pagas {puzzleRetryCost(streak)} puntos
                para que este fallo no la rompa?
              </p>
              <p className="puzzle-protection-balance" role="status">
                <b>Saldo: {points} puntos</b>
                <span>Los ganas en Torneo y sirven para pedir pistas o proteger una racha de entrenamiento. No afectan a tu nivel competitivo.</span>
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

        <div className="tutorial-text puzzle-friendly-info">
          <span className="eyebrow">{KIND_LABELS[puzzle.kind] || 'Puzzle'}</span>
          <div className="combat-heading-row"><h2>{puzzle.title}</h2><MechanicTutorialHelp tutorialId="puzzles" /></div>
          <p>{puzzle.description}</p>
          {source === 'curated' && <p className="hint-text friendly-inline-note">Rotamos entre remates, horquillas, diagonales, columnas y promociones para que el entrenamiento no se convierta en repetir la misma posición.</p>}
          <p className="hint-text friendly-inline-note">Juegas con <b>{humanColor === 'w' ? 'blancas' : 'negras'}</b>. Elige pieza y destino; si fallas puedes volver a intentarlo.</p>

          {source === 'daily' && (
            <div className={`daily-challenge-note ${dailyBrief.full ? 'is-solved' : ''}`}><b>📅 {puzzle.dailySlotLabel ? `${puzzle.dailySlotLabel} · ` : ''}{dailyBrief.headline}</b><span>{dailyBrief.detail}</span></div>
          )}
          {source === 'daily' && achievementUnlocked && (
            <div className="daily-achievement-unlock" role="status">
              <span>🏅</span>
              <div><small>Distintivo desbloqueado</small><strong>{achievementUnlocked.first.name}</strong></div>
              {achievementUnlocked.count > 1 && <b>+{achievementUnlocked.count - 1}</b>}
            </div>
          )}
          {source === 'personal' && (
            <p className="hint-text personal-puzzle-note">☠ Posición nacida de una de tus propias autopsias.{initialFilter?.opening ? ` Apertura: ${initialFilter.opening}.` : ''}</p>
          )}

          <details className="friendly-disclosure puzzle-progress-details">
            <summary>Progreso y detalles</summary>
            <div className="friendly-disclosure-body">
              <p className="hint-text">Resueltos en esta sesión: <b>{solvedCount}</b> · racha: <b>{streak}</b> · mejor: <b>{bestStreak}</b></p>
              {source === 'personal' && personalStats.attempts > 0 && (
                <p className="hint-text">Entrenamiento personal: <b>{personalStats.cleanSolves}/{personalStats.attempts}</b> limpias{personalStats.cleanRate !== null ? ` · ${personalStats.cleanRate}%` : ''}.</p>
              )}
              {source === 'daily' && (
                <div className="daily-challenge-panel compact">
                  <p className="hint-text">Racha diaria: <b>{dailyStats.streak || 0}</b> · mejor: <b>{dailyStats.bestStreak || 0}</b></p>
                  <div className="daily-calendar" aria-label="Últimos 28 días de desafío diario">
                    {dailyCells.map((cell) => <span key={cell.key} className={`${cell.solved ? 'solved' : ''} ${cell.today ? 'today' : ''}`} title={`${cell.key}${cell.solved ? ' · resuelto' : ' · pendiente/no resuelto'}`}><small>{cell.weekday}</small><b>{cell.day}</b></span>)}
                  </div>
                  <small className="hint-text">Últimos 28 días.</small>
                </div>
              )}
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
