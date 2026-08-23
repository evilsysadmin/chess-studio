import { useEffect, useMemo, useState } from 'react';
import Board from './Board.jsx';
import { api } from '../api.js';
import { formatLongMove } from '../notation.js';
import { analyzeCombatLog } from '../gameReport.js';
import { identifyOpening } from '../openings.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { useArrowKeyNav } from '../useArrowKeyNav.js';
import WorstMovesPanel, { SEVERITY_LABEL } from './WorstMovesPanel.jsx';
import GlossaryTerm from './GlossaryTerm.jsx';

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// A diferencia de ReplayScreen, acá NO se reconstruyen las posiciones
// jugando el registro con chess.js — el `log` de una batalla ya trae el FEN
// resultante de cada paso (ver combatHistory.js). Solo quedan registrados
// los intentos que CONECTARON (los fallos/esquives no mueven la pieza, así
// que no hay jugada real que guardar) — pero un fallo igual consume el
// turno del que lo intentó, así que dos entradas seguidas del mismo lado
// son posibles en el log. Eso rompería el supuesto de "alternancia
// estricta blanco/negro" si se intentara reproducir con chess.js normal —
// por eso se indexa el FEN guardado directamente, en vez de rejugar nada.
export default function CombatReplayScreen({ record, initialStep, pinnedReport, onExit }) {
  useEscapeToClose(onExit);
  const positions = useMemo(() => [STARTING_FEN, ...record.log.map((e) => e.fenAfter)], [record]);
  const [step, setStep] = useState(initialStep ?? positions.length - 1);
  const [report, setReport] = useState(null);
  const [analyzing, setAnalyzing] = useState(true);
  const [analyzeError, setAnalyzeError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setReport(null);
    setAnalyzeError(null);
    setAnalyzing(true);
    analyzeCombatLog(record.log, record.humanColor, api)
      .then((result) => { if (!cancelled) setReport(result); })
      .catch((e) => { if (!cancelled) setAnalyzeError(e.message); })
      .finally(() => { if (!cancelled) setAnalyzing(false); });
    return () => { cancelled = true; };
  }, [record]);

  const reportByIndex = useMemo(() => {
    const map = new Map();
    if (report) for (const m of report.moveReports) map.set(m.index, m);
    if (pinnedReport) map.set(pinnedReport.index, pinnedReport);
    return map;
  }, [report, pinnedReport]);

  function goTo(i) {
    setStep(Math.max(0, Math.min(positions.length - 1, i)));
  }

  useArrowKeyNav(() => goTo(step - 1), () => goTo(step + 1));

  const fen = positions[step];
  // Best-effort: el log de combate solo guarda los ataques que conectaron
  // (ver combatHistory.js), así que si hubo un fallo bien al principio, la
  // secuencia puede no calzar con ninguna apertura conocida — no revienta,
  // simplemente no reconoce nada en ese caso.
  const opening = identifyOpening(record.log.slice(0, step).map((m) => m.san));
  const entryAtStep = step > 0 ? record.log[step - 1] : null;
  const entryIndexAtStep = step > 0 ? step - 1 : null;
  const wasHumanMove = entryAtStep?.by === 'human';
  const reportAtStep = entryIndexAtStep !== null ? reportByIndex.get(entryIndexAtStep) : null;

  const isRealMistake = reportAtStep && reportAtStep.severity !== 'ok' && reportAtStep.severity !== 'unrated';
  const hintMove = isRealMistake ? { from: reportAtStep.suggestedFrom, to: reportAtStep.suggestedTo } : null;
  const lastMoveSquares = entryAtStep ? { from: entryAtStep.from, to: entryAtStep.to } : null;
  const mistakeMove = isRealMistake
    ? {
        from: reportAtStep.playedFrom,
        to: reportAtStep.playedTo,
        piece: entryAtStep.piece,
      }
    : null;

  return (
    <div className="tutorial-shell">
      <button className="back-link" onClick={onExit}>← Volver al historial de Combat Chess</button>

      {analyzing && (
        <p className="hint-text replay-analyzing-banner">
          Comparando cada intento tuyo contra lo que el motor hubiera preferido — se analiza la decisión, no si
          el dado te acompañó o no.
        </p>
      )}
      {analyzeError && (
        <p className="error-text replay-analyzing-banner">
          No se pudo analizar la batalla (¿está corriendo el backend?). Igual puedes recorrerla a mano.
        </p>
      )}
      {report && (
        <p className="hint-text replay-analyzing-banner">
          {report.label} Pérdida promedio de <GlossaryTerm term="Evaluación">evaluación</GlossaryTerm>: <b>{report.averageLoss}</b>
          {' · '}se revisaron {report.analyzedCount} de tus intentos.
        </p>
      )}

      <div className="game-layout">
        <div className="board-column">
          <Board
            fen={fen}
            lastMove={lastMoveSquares}
            hintMove={hintMove}
            mistakeMove={mistakeMove}
            orientation={record.humanColor === 'b' ? 'black' : 'white'}
          />
          <div className="game-controls">
            <button className="secondary-btn" onClick={() => goTo(0)} disabled={step === 0}>⏮ Inicio</button>
            <button className="secondary-btn" onClick={() => goTo(step - 1)} disabled={step === 0}>← Anterior</button>
            <button className="secondary-btn" onClick={() => goTo(step + 1)} disabled={step === positions.length - 1}>Siguiente →</button>
            <button className="secondary-btn" onClick={() => goTo(positions.length - 1)} disabled={step === positions.length - 1}>Final ⏭</button>
          </div>
          <p className="hint-text replay-key-hint">← → del teclado también navegan</p>

          <div className="replay-current-move">
            <span className="eyebrow">Jugada {step} de {record.log.length}</span>
            <h2>{entryAtStep ? formatLongMove(entryAtStep) : 'Posición inicial'}</h2>
            {entryAtStep && (
              <p className="hint-text">
                {wasHumanMove ? 'La jugaste tú.' : 'La jugó la CPU.'}
                {entryAtStep.captured ? ' Hubo captura.' : ''}
              </p>
            )}
            {!entryAtStep && <p className="hint-text">Usa las flechas para recorrer la batalla paso a paso.</p>}

            {wasHumanMove && reportAtStep && (
              <p className={`hint-caption replay-verdict sev-${reportAtStep.severity}`}>
                {reportAtStep.severity === 'ok'
                  ? '✓ No había nada mejor a mano — buena decisión, más allá de cómo salió el dado.'
                  : `${SEVERITY_LABEL[reportAtStep.severity]}: jugaste ${formatLongMove(entryAtStep)}, pero el motor prefería ${formatLongMove({ piece: reportAtStep.suggestedPiece, from: reportAtStep.suggestedFrom, to: reportAtStep.suggestedTo })} (recuadro punteado azul) — perdiste ~${reportAtStep.loss} de evaluación con esa decisión.`}
              </p>
            )}
            {wasHumanMove && !reportAtStep && !analyzing && report && (
              <p className="hint-text">Este intento quedó fuera de la ventana analizada.</p>
            )}
          </div>
        </div>

        <aside className="notation-panel">
          <WorstMovesPanel report={report} onJump={goTo} />

          <h3>Registro de la batalla</h3>
          {opening && <p className="opening-tag">{opening}</p>}
          <div className="notation-list">
            {record.log.length === 0 && <p className="notation-empty">Esta batalla no tiene jugadas.</p>}
            {record.log.map((entry, i) => {
              const entryReport = reportByIndex.get(i);
              return (
                <button
                  key={i}
                  type="button"
                  className={`move-chip combat-log-chip ${entryReport ? `sev-${entryReport.severity}` : ''} ${step === i + 1 ? 'active' : ''}`}
                  onClick={() => goTo(i + 1)}
                  title={entryReport ? `${SEVERITY_LABEL[entryReport.severity]} (-${entryReport.loss})` : undefined}
                >
                  <span className="combat-log-side">{entry.by === 'human' ? 'Tú' : 'CPU'}</span>
                  <span>{formatLongMove(entry)}</span>
                </button>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
