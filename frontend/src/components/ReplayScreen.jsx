import { useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import Board from './Board.jsx';
import { api } from '../api.js';
import { formatLongMove } from '../notation.js';
import { toPGN, downloadPGN } from '../pgn.js';
import { analyzeGame } from '../gameReport.js';
import { identifyOpening } from '../openings.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { useArrowKeyNav } from '../useArrowKeyNav.js';
import WorstMovesPanel, { SEVERITY_LABEL } from './WorstMovesPanel.jsx';
import GameChat from './GameChat.jsx';
import GlossaryTerm from './GlossaryTerm.jsx';

// Reconstruye el FEN en cada punto de la partida a partir de la lista de
// jugadas guardada. positions[0] es la posición inicial; positions[i] es la
// posición después de la jugada i-1 de la lista.
function buildPositions(moves, initialFen = null) {
  const c = initialFen ? new Chess(initialFen) : new Chess();
  const positions = [c.fen()];
  for (const m of moves) {
    try {
      c.move({ from: m.from, to: m.to, promotion: 'q' });
    } catch {
      // Si por algo la reconstrucción falla, cortamos ahí en vez de romper la pantalla.
      break;
    }
    positions.push(c.fen());
  }
  return positions;
}

// Agrupa el historial en pares [blancas, negras] por turno, conservando el
// índice real de cada jugada dentro de `moves` (lo necesita el semáforo de
// severidad para saber a cuál jugada corresponde cada análisis).
function toPairs(moves) {
  const pairs = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({
      num: i / 2 + 1,
      white: { move: moves[i], index: i },
      black: moves[i + 1] ? { move: moves[i + 1], index: i + 1 } : null,
    });
  }
  return pairs;
}

// El historial guardado ya trae el resultado desde el punto de vista del
// humano ('win' | 'draw' | 'loss') — lo traducimos al formato de PGN.
function outcomeToPgnResult(outcome, humanColor) {
  if (outcome === 'draw') return '1/2-1/2';
  const humanWon = outcome === 'win';
  if (humanWon) return humanColor === 'w' ? '1-0' : '0-1';
  return humanColor === 'w' ? '0-1' : '1-0';
}

export default function ReplayScreen({ record, initialStep, pinnedReport, crimeMode = false, movieMode = false, onPlayFromHere, onExit }) {
  useEscapeToClose(onExit);
  const positions = useMemo(() => buildPositions(record.moves, record.initialFen), [record]);
  const pairs = useMemo(() => toPairs(record.moves), [record]);
  const [step, setStep] = useState(initialStep ?? positions.length - 1);
  const [report, setReport] = useState(null);
  const [analyzing, setAnalyzing] = useState(true);
  const [analyzeError, setAnalyzeError] = useState(null);
  const [moviePlaying, setMoviePlaying] = useState(false);
  const [movieSpeed, setMovieSpeed] = useState(1);

  // Analiza la partida ENTERA una sola vez al entrar — no hace falta pedirlo
  // jugada por jugada, así se puede recorrer el cuaderno de jugadas y ver de
  // un vistazo dónde estuvieron los errores, en vez de ir pinchando de a uno.
  useEffect(() => {
    let cancelled = false;
    setReport(null);
    setAnalyzeError(null);
    setAnalyzing(true);
    analyzeGame(record.moves, record.humanColor, api)
      .then((result) => { if (!cancelled) setReport(result); })
      .catch((e) => { if (!cancelled) setAnalyzeError(e.message); })
      .finally(() => { if (!cancelled) setAnalyzing(false); });
    return () => { cancelled = true; };
  }, [record]);

  useEffect(() => {
    if (movieMode && report && step === 0) setMoviePlaying(true);
  }, [movieMode, report]);

  // Índice-en-history -> su reporte de análisis, para no recorrer el
  // arreglo entero cada vez que cambia el paso actual.
  // pinnedReport (si viene de "Buscar mi peor jugada de siempre", donde ya
  // se analizó esta jugada puntual) tiene PRIORIDAD sobre lo que encuentre
  // el análisis fresco de acá abajo — así, si ese análisis independiente
  // se topa con el límite de requests/minuto justo en esta jugada (les pasó
  // de verdad: buscar en todo el historial ya gasta buena parte del
  // presupuesto), igual se muestra el resultado correcto en vez de un
  // "quedó fuera de la ventana" engañoso.
  const reportByIndex = useMemo(() => {
    const map = new Map();
    if (report) for (const m of report.moveReports) map.set(m.index, m);
    if (pinnedReport) map.set(pinnedReport.index, pinnedReport);
    return map;
  }, [report, pinnedReport]);

  const criticalMoments = useMemo(() => {
    const rows = report?.moveReports || [];
    return rows.filter((m) => ['mistake','blunder'].includes(m.severity)).map((m) => ({ ...m, step: Number(m.index) + 1 }));
  }, [report]);

  function jumpCritical(direction = 1) {
    if (!criticalMoments.length) return;
    const ordered = direction > 0 ? criticalMoments : [...criticalMoments].reverse();
    const target = ordered.find((m) => direction > 0 ? m.step > step : m.step < step) || ordered[0];
    if (target) { setMoviePlaying(false); goTo(target.step); }
  }

  useEffect(() => {
    if (!moviePlaying) return undefined;
    if (step >= positions.length - 1) { setMoviePlaying(false); return undefined; }
    const currentReport = step > 0 ? reportByIndex.get(step - 1) : null;
    const dramatic = currentReport && ['mistake', 'blunder'].includes(currentReport.severity);
    const baseDelay = dramatic ? 1500 : 720;
    const timer = setTimeout(() => setStep((s) => Math.min(positions.length - 1, s + 1)), Math.max(180, Math.round(baseDelay / movieSpeed)));
    return () => clearTimeout(timer);
  }, [moviePlaying, movieSpeed, step, positions.length, reportByIndex]);

  function goTo(i) {
    setStep(Math.max(0, Math.min(positions.length - 1, i)));
  }

  useArrowKeyNav(() => goTo(step - 1), () => goTo(step + 1));

  function handleDownloadPGN() {
    const result = outcomeToPgnResult(record.outcome, record.humanColor);
    const white = record.humanColor === 'w' ? 'Jugador' : `CPU (nivel ${record.difficulty})`;
    const black = record.humanColor === 'b' ? 'Jugador' : `CPU (nivel ${record.difficulty})`;
    const pgn = toPGN(record.moves, { white, black, result, date: record.date });
    downloadPGN(pgn, `partida-${record.date.slice(0, 10)}.pgn`);
  }

  const fen = positions[step];
  const opening = identifyOpening(record.moves.slice(0, step).map((m) => m.san));
  const moveAtStep = step > 0 ? record.moves[step - 1] : null;
  const moveIndexAtStep = step > 0 ? step - 1 : null;
  const moverColor = step > 0 ? ((step - 1) % 2 === 0 ? 'w' : 'b') : null;
  const wasHumanMove = moveAtStep && moverColor === record.humanColor;
  const moveReportAtStep = moveIndexAtStep !== null ? reportByIndex.get(moveIndexAtStep) : null;

  // La "pista inversa": si esta jugada tuvo un desliz de verdad, mostramos
  // en el tablero dónde el motor hubiera preferido mover — el mismo
  // lenguaje visual que una pista normal (borde punteado azul), solo que
  // mirando para atrás en vez de hacia adelante.
  const isRealMistake = moveReportAtStep && moveReportAtStep.severity !== 'ok' && moveReportAtStep.severity !== 'unrated';
  const hintMove = isRealMistake ? { from: moveReportAtStep.suggestedFrom, to: moveReportAtStep.suggestedTo } : null;
  const lastMoveSquares = moveAtStep ? { from: moveAtStep.from, to: moveAtStep.to } : null;
  const mistakeMove = isRealMistake
    ? {
        from: moveReportAtStep.playedFrom,
        to: moveReportAtStep.playedTo,
        piece: moverColor === 'w' ? moveAtStep.piece.toUpperCase() : moveAtStep.piece.toLowerCase(),
      }
    : null;

  return (
    <div className="tutorial-shell">
      <button className="back-link" onClick={onExit}>← Volver al historial</button>

      {movieMode && (
        <div className="movie-banner movie-banner-v2">
          <div><span className="eyebrow">PELÍCULA DE LA PARTIDA · DIRECTOR'S CUT</span><b>{moviePlaying ? 'Reproduciendo el expediente…' : step >= positions.length - 1 ? 'Fin del metraje' : 'Pausa dramática'}</b><small>{criticalMoments.length} momentos críticos detectados por el análisis.</small></div>
          <div className="movie-controls">
            <button className="primary-btn" onClick={() => { if (step >= positions.length - 1) setStep(0); setMoviePlaying((v) => !v); }}>{moviePlaying ? 'Pausar' : '▶ Reproducir'}</button>
            <div className="movie-speed" aria-label="Velocidad de reproducción">{[0.5,1,1.75].map((speed)=><button key={speed} className={movieSpeed===speed?'primary-btn':'secondary-btn'} onClick={()=>setMovieSpeed(speed)}>{speed}×</button>)}</div>
            {criticalMoments.length>0&&<div className="movie-critical-nav"><button className="secondary-btn" onClick={()=>jumpCritical(-1)}>← crítico</button><button className="secondary-btn" onClick={()=>jumpCritical(1)}>crítico →</button></div>}
          </div>
        </div>
      )}

      {movieMode && criticalMoments.length>0 && (
        <div className="movie-chapters" aria-label="Capítulos críticos">
          {criticalMoments.slice(0,12).map((m)=><button key={`${m.index}-${m.severity}`} className={`movie-chapter sev-${m.severity} ${step===m.step?'active':''}`} onClick={()=>{setMoviePlaying(false);goTo(m.step);}}>J{m.moveNumber || Math.ceil((m.index+1)/2)} · {SEVERITY_LABEL[m.severity]}</button>)}
        </div>
      )}

      {analyzing && (
        <p className="hint-text replay-analyzing-banner">
          Comparando tus jugadas contra lo que el motor hubiera preferido en cada momento… puedes navegar el
          tablero mientras tanto, el cuaderno se va a ir coloreando solo cuando termine.
        </p>
      )}
      {analyzeError && (
        <p className="error-text replay-analyzing-banner">
          No se pudo analizar la partida (¿está corriendo el backend?). Igual puedes recorrerla a mano.
        </p>
      )}
      {report && (
        <p className="hint-text replay-analyzing-banner">
          {report.label} Pérdida promedio de <GlossaryTerm term="Evaluación">evaluación</GlossaryTerm>: <b>{report.averageLoss}</b>
          {' · '}se revisaron {report.analyzedCount} de tus jugadas.
        </p>
      )}

      {crimeMode && pinnedReport && (
        <div className="crime-scene-banner">
          <div>
            <span className="eyebrow">CÁMARA DEL CRIMEN</span>
            <b>Jugada {pinnedReport.moveNumber}: {pinnedReport.played} · pérdida estimada de {pinnedReport.loss} puntos</b>
            <p>Estás justo antes del impacto. Reproduce la jugada y compara después con la alternativa marcada por el motor.</p>
          </div>
          <button className="primary-btn" onClick={() => goTo(pinnedReport.index + 1)}>
            ▶ Reproducir crimen
          </button>
        </div>
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
          {crimeMode && pinnedReport && (
            <button className="secondary-btn crime-rewind-btn" onClick={() => goTo(Math.max(0, pinnedReport.index))}>
              ↶ Volver a antes del crimen
            </button>
          )}
          <details className="game-advanced-tools replay-advanced-tools">
            <summary>Opciones avanzadas</summary>
            <div className="game-advanced-tools-body">
              <div>
                <b>Exportar partida</b>
                <small>Formato <GlossaryTerm term="PGN">PGN</GlossaryTerm>, compatible con otras aplicaciones de ajedrez.</small>
              </div>
              <button className="secondary-btn" onClick={handleDownloadPGN}>Exportar archivo .pgn</button>
            </div>
          </details>
          {onPlayFromHere && (
            <button className="primary-btn lab-from-here-btn" style={{ marginTop: '0.6rem' }} onClick={() => onPlayFromHere(fen, record.humanColor, record.difficulty, { sourceRecord: record })}>
              🧪 Jugar desde aquí contra la CPU
            </button>
          )}

          <div className="replay-current-move">
            <span className="eyebrow">Jugada {step} de {record.moves.length}</span>
            <h2>{moveAtStep ? formatLongMove(moveAtStep) : 'Posición inicial'}</h2>
            {moveAtStep && (
              <p className="hint-text">
                {wasHumanMove ? 'La jugaste tú.' : 'La jugó la CPU.'}
                {moveAtStep.captured ? ' Hubo captura.' : ''}
              </p>
            )}
            {!moveAtStep && <p className="hint-text">Usa las flechas para recorrer la partida jugada por jugada.</p>}

            {wasHumanMove && moveReportAtStep && (
              <p className={`hint-caption replay-verdict sev-${moveReportAtStep.severity}`}>
                {moveReportAtStep.severity === 'ok'
                  ? '✓ No había nada mejor a mano — buena jugada.'
                  : `${SEVERITY_LABEL[moveReportAtStep.severity]}: jugaste ${formatLongMove(moveAtStep)}, pero el motor prefería ${formatLongMove({ piece: moveReportAtStep.suggestedPiece, from: moveReportAtStep.suggestedFrom, to: moveReportAtStep.suggestedTo })} (el recuadro punteado azul del tablero) — perdiste ~${moveReportAtStep.loss} de evaluación ahí.`}
              </p>
            )}
            {wasHumanMove && !moveReportAtStep && !analyzing && report && (
              <p className="hint-text">Esta jugada quedó fuera de la ventana analizada.</p>
            )}
          </div>
        </div>

        <div className="game-side-column">
          {record.gameChat?.length > 0 && <GameChat messages={record.gameChat} compact title="Game Chat · archivo" />}
          <aside className="notation-panel">
            <WorstMovesPanel report={report} onJump={goTo} />

            <h3>Cuaderno de jugadas</h3>
            {opening && <p className="opening-tag">{opening}</p>}
            <div className="notation-list">
              {pairs.length === 0 && <p className="notation-empty">Esta partida no tiene jugadas.</p>}
              {pairs.map((p) => {
                const whiteReport = reportByIndex.get(p.white.index);
                const blackReport = p.black ? reportByIndex.get(p.black.index) : null;
                return (
                  <div className="notation-row" key={p.num}>
                    <span className="num">{p.num}.</span>
                    <button
                      type="button"
                      className={`move-chip ${whiteReport ? `sev-${whiteReport.severity}` : ''} ${step === p.white.index + 1 ? 'active' : ''}`}
                      onClick={() => goTo(p.white.index + 1)}
                      title={whiteReport ? `${SEVERITY_LABEL[whiteReport.severity]} (-${whiteReport.loss})` : undefined}
                    >
                      {formatLongMove(p.white.move)}
                    </button>
                    {p.black && (
                      <button
                        type="button"
                        className={`move-chip ${blackReport ? `sev-${blackReport.severity}` : ''} ${step === p.black.index + 1 ? 'active' : ''}`}
                        onClick={() => goTo(p.black.index + 1)}
                        title={blackReport ? `${SEVERITY_LABEL[blackReport.severity]} (-${blackReport.loss})` : undefined}
                      >
                        {formatLongMove(p.black.move)}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
