import { useEffect, useMemo, useState } from 'react';
import Board from './Board.jsx';
import { replayFenPositions } from '../chessRules.js';
import { buildCinematicAutopsyPlan, clampCinematicAutopsyCursor } from '../cinematicAutopsy.js';
import { focusPersonalPuzzle, personalPuzzleFromMistake, savePersonalPuzzlesFromReport } from '../personalPuzzles.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import './CinematicAutopsyModal.css';

function prefersReducedMotion() {
  try {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  } catch {
    return false;
  }
}

function moveSquares(move, historyEntry) {
  const from = move?.playedFrom || historyEntry?.from || null;
  const to = move?.playedTo || historyEntry?.to || null;
  return from && to ? { from, to } : null;
}

function suggestedSquares(move) {
  const from = move?.suggestedFrom || null;
  const to = move?.suggestedTo || null;
  return from && to ? { from, to } : null;
}

export default function CinematicAutopsyModal({
  history,
  humanColor,
  moments,
  meta = {},
  onClose,
  onTrainPersonal,
  onOpenCrimeScene,
}) {
  useEscapeToClose(onClose);
  const plan = useMemo(() => buildCinematicAutopsyPlan(moments), [moments]);
  const replay = useMemo(() => replayFenPositions(history, meta.initialFen || null), [history, meta.initialFen]);
  const [cursor, setCursor] = useState(0);
  const [phase, setPhase] = useState('before');
  const reducedMotion = useMemo(prefersReducedMotion, []);

  const safeCursor = clampCinematicAutopsyCursor(plan, cursor);
  const chapter = plan[safeCursor] || null;
  const sourceMoment = chapter
    ? (moments || []).find((item) => Number(item?.move?.index) === chapter.moveIndex) || null
    : null;
  const move = sourceMoment?.move || null;
  const historyEntry = chapter ? history?.[chapter.moveIndex] : null;
  const step = chapter ? (phase === 'impact' ? chapter.impactStep : chapter.focusStep) : 0;
  const fen = replay.positions?.[Math.max(0, Math.min((replay.positions?.length || 1) - 1, step))] || meta.initialFen || null;
  const trainablePuzzle = useMemo(() => (
    move ? personalPuzzleFromMistake(history, humanColor, move, meta) : null
  ), [history, humanColor, move, meta]);

  useEffect(() => {
    setPhase('before');
  }, [safeCursor]);

  if (!chapter || !fen) return null;

  function selectChapter(index) {
    setCursor(clampCinematicAutopsyCursor(plan, index));
    setPhase('before');
  }

  function trainCurrentCrime() {
    if (!trainablePuzzle || !onTrainPersonal) return;
    savePersonalPuzzlesFromReport(history, humanColor, { topMistakes: [move] }, meta);
    focusPersonalPuzzle(trainablePuzzle.id);
    onClose?.();
    onTrainPersonal();
  }

  return (
    <div className="cinematic-autopsy-backdrop" role="presentation" onClick={onClose}>
      <section
        className="cinematic-autopsy-shell"
        role="dialog"
        aria-modal="true"
        aria-label="Autopsia cinematográfica"
        data-reduced-motion={reducedMotion ? 'true' : 'false'}
        data-cinematic-phase={phase}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="cinematic-autopsy-header">
          <div>
            <span className="eyebrow">AUTOPSIA CINEMATOGRÁFICA · {safeCursor + 1}/{plan.length}</span>
            <h3>{chapter.icon} {chapter.label}</h3>
            <p>Jugada {chapter.moveNumber}: <strong>{chapter.played || '—'}</strong>{chapter.loss > 0 ? ` · −${chapter.loss} cp` : ''}</p>
          </div>
          <button type="button" className="piece-info-close" onClick={onClose} aria-label="Cerrar autopsia cinematográfica">×</button>
        </header>

        <div className="cinematic-autopsy-stage">
          <div className="cinematic-autopsy-board" aria-label={phase === 'before' ? 'Posición antes del momento' : 'Posición tras el impacto'}>
            <Board
              fen={fen}
              orientation={humanColor === 'b' ? 'black' : 'white'}
              lastMove={phase === 'impact' ? moveSquares(move, historyEntry) : null}
              hintMove={suggestedSquares(move)}
            />
            <span className="cinematic-autopsy-phase">{phase === 'before' ? 'ANTES DEL IMPACTO' : 'DESPUÉS DEL IMPACTO'}</span>
          </div>

          <aside className="cinematic-autopsy-dossier">
            <span className={`cinematic-autopsy-severity sev-${chapter.severity}`}>{chapter.severity === 'blunder' ? 'BLUNDER' : chapter.severity === 'mistake' ? 'ERROR' : 'HALLAZGO'}</span>
            <p>{chapter.detail || 'Momento respaldado por el análisis de la partida.'}</p>
            {chapter.suggested && <p><small>Alternativa del motor</small><strong>{chapter.suggested}</strong></p>}
            <p className="hint-text">La alternativa describe lo que el motor prefería en esa posición; no presume qué intentabas hacer.</p>

            <div className="cinematic-autopsy-actions">
              <button type="button" className="primary-btn" onClick={() => setPhase((value) => value === 'before' ? 'impact' : 'before')}>
                {phase === 'before' ? '▶ Reproducir impacto' : '↶ Ver antes'}
              </button>
              {trainablePuzzle && onTrainPersonal && (
                <button type="button" className="secondary-btn" onClick={trainCurrentCrime}>🧠 Entrenar este crimen</button>
              )}
              {onOpenCrimeScene && (
                <button type="button" className="secondary-btn" onClick={() => onOpenCrimeScene(move)}>Abrir replay forense</button>
              )}
            </div>
          </aside>
        </div>

        <nav className="cinematic-autopsy-chapters" aria-label="Momentos de la autopsia">
          {plan.map((item, index) => (
            <button
              type="button"
              key={item.id}
              className={index === safeCursor ? 'active' : ''}
              aria-current={index === safeCursor ? 'step' : undefined}
              onClick={() => selectChapter(index)}
            >
              <span>{item.icon}</span>
              <b>{item.label}</b>
              <small>J{item.moveNumber}</small>
            </button>
          ))}
        </nav>

        <div className="cinematic-autopsy-nav-actions">
          <button type="button" className="secondary-btn" disabled={safeCursor === 0} onClick={() => selectChapter(safeCursor - 1)}>← Anterior</button>
          <button type="button" className="secondary-btn" disabled={safeCursor >= plan.length - 1} onClick={() => selectChapter(safeCursor + 1)}>Siguiente hallazgo →</button>
        </div>
      </section>
    </div>
  );
}
