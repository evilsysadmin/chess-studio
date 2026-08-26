import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { analyzeGame } from '../gameReport.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { savePersonalPuzzlesFromReport } from '../personalPuzzles.js';
import { accuracyScore, archiveAnalysis, bestMoveOfReport, explainMoveReport, moveContextLines, pointOfNoReturn } from '../advancedCareer.js';
import { keyGameMoments } from '../postGameHighlights.js';
import { glossaryEntry } from '../chessGlossary.js';
import GlossaryTerm from './GlossaryTerm.jsx';
import { getToken } from '../auth.js';
import { requestRemoteNarrative } from '../narrativeRemote.js';
import { buildPostGameAutopsyDossier } from '../aiNarrativeTasks.js';

const CP_GLOSSARY = glossaryEntry('cp');
const CCT_GLOSSARY = glossaryEntry('CCT');

function incidentTitle(index, mistake, total) {
  if (index === 0 && mistake.loss >= 300) return 'Hora aproximada del fallecimiento';
  if (index === 0) return 'Punto de inflexión';
  if (index === total - 1) return 'Daños colaterales';
  return 'Segundo impacto';
}

function MoveContext({ move }) {
  const lines = moveContextLines(move);
  if (!lines.length) return null;
  return <div className="autopsy-move-context">{lines.map((line, index) => <span key={`${move.index ?? 'move'}-${index}`}>{line}</span>)}</div>;
}

function forensicVerdict(report) {
  const worst = report.worst?.loss || 0;
  if (report.averageLoss < 20) return 'Dictamen: paciente sorprendentemente sano. Casi no hay cadáver que examinar.';
  if (worst >= 600) return 'Dictamen: la posición sufrió un traumatismo táctico incompatible con una partida digna. El cadáver siguió moviendo piezas por pura inercia administrativa.';
  if (worst >= 300) return 'Dictamen: una jugada abrió una vía de agua seria y el resto de la partida se dedicó principalmente a discutir con la gravedad.';
  if (report.averageLoss >= 150) return 'Dictamen: múltiples lesiones tácticas. Ninguna por sí sola explica todo, pero juntas forman un expediente bastante convincente.';
  if (report.averageLoss >= 60) return 'Dictamen: hubo daños evitables y al menos una decisión que merece ser interrogada con luz blanca y café malo.';
  return 'Dictamen: pequeñas contusiones, nada que requiera cerrar el club ni cambiar de identidad.';
}

export default function GameReportModal({ history, humanColor, onClose, onOpenCrimeScene, onShareIncident, meta = {} }) {
  useEscapeToClose(onClose);
  const [status, setStatus] = useState('loading');
  const [report, setReport] = useState(null);
  const [personalPuzzleInfo, setPersonalPuzzleInfo] = useState(null);
  const [aiAutopsy, setAiAutopsy] = useState(null);
  const [aiAutopsyStatus, setAiAutopsyStatus] = useState('idle');
  const archivedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await analyzeGame(history, humanColor, api);
        if (!cancelled) { setReport(result); setStatus('done'); }
      } catch { if (!cancelled) setStatus('error'); }
    })();
    return () => { cancelled = true; };
  }, [history, humanColor]);

  useEffect(() => {
    if (status !== 'done' || !report || archivedRef.current) return;
    archivedRef.current = true;
    const info = savePersonalPuzzlesFromReport(history, humanColor, report, meta);
    setPersonalPuzzleInfo(info);
    if (meta.gameId) archiveAnalysis(meta.gameId, report, meta);
  }, [status, report, history, humanColor, meta]);

  useEffect(() => {
    if (status !== 'done' || !report) return undefined;
    const token = getToken();
    const dossier = buildPostGameAutopsyDossier(report, { ...meta, accuracy: accuracyScore(report) });
    if (!token || !dossier) {
      setAiAutopsyStatus('unavailable');
      return undefined;
    }
    let active = true;
    setAiAutopsyStatus('loading');
    void requestRemoteNarrative(dossier, { token, timeoutMs: 8000 }).then((text) => {
      if (!active) return;
      if (text) {
        setAiAutopsy(text);
        setAiAutopsyStatus('done');
      } else {
        setAiAutopsyStatus('unavailable');
      }
    });
    return () => { active = false; };
  }, [status, report, meta.gameId]);

  const incidents = report?.topMistakes?.filter((m) => m.loss > 15) || [];
  const accuracy = report ? accuracyScore(report) : null;
  const best = report ? bestMoveOfReport(report) : null;
  const noReturn = report ? pointOfNoReturn(report) : null;
  const keyMoments = report ? keyGameMoments(report) : [];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="army-card game-autopsy" role="dialog" aria-modal="true" aria-label="Resumen de la partida" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 620 }}>
        <button className="piece-info-close" onClick={onClose} aria-label="Cerrar">×</button>
        <p className="eyebrow">Post-partida</p>
        <h3>Resumen de la partida</h3>

        {status === 'loading' && <div className="ui-state ui-state-loading" role="status"><b>Preparando el resumen</b><span>Buscando los momentos que más explican la partida…</span></div>}
        {status === 'error' && <div className="ui-state ui-state-error" role="alert"><b>No se pudo generar el resumen</b><span>El servicio de análisis no respondió. Cierra esta ventana e inténtalo de nuevo.</span></div>}

        {status === 'done' && report && <>
          {report.analyzedCount === 0 ? <p className="hint-text">No hubo suficientes jugadas propias para analizar.</p> : <>
            <div className="autopsy-summary">
              <div><span>Precisión estimada</span><b>{accuracy}%</b></div>
              <div><span>Error medio</span><b>−{report.averageLoss} puntos de evaluación</b></div>
              <div><span>Jugadas revisadas</span><b>{report.analyzedCount}</b></div>
            </div>
            <div className="autopsy-key-moments" aria-label="Momentos clave de la partida">
              {keyMoments.map((item) => (
                <article key={`${item.kind}-${item.move.index}`} className={`autopsy-key-moment sev-${item.move.severity || 'ok'}`}>
                  <span className="autopsy-key-icon" aria-hidden="true">{item.icon}</span>
                  <div><b>{item.label}</b><span>Jugada {item.move.moveNumber}: {item.move.played}</span><small>{item.detail}</small></div>
                </article>
              ))}
            </div>

            {aiAutopsyStatus === 'loading' && <div className="ai-task-card is-loading"><small>CPU // AUTOPSIA AI</small><p>Revisando las pruebas sin inventarme cadáveres adicionales…</p></div>}
            {aiAutopsy && <div className="ai-task-card"><small>CONSEJOS // ANÁLISIS DE PARTIDA</small><p>{aiAutopsy}</p></div>}

            {personalPuzzleInfo?.added > 0 && <div className="autopsy-training-note">🧠 He archivado {personalPuzzleInfo.added} {personalPuzzleInfo.added === 1 ? 'error tuyo' : 'errores tuyos'} como {personalPuzzleInfo.added === 1 ? 'puzzle personal' : 'puzzles personales'} en <b>Tus crímenes</b>.</div>}

            <div className="autopsy-actions">
              {report.worst && report.worst.loss > 15 && onOpenCrimeScene && <button className="primary-btn crime-scene-btn" onClick={() => onOpenCrimeScene(report.worst, report)}>🎥 Ver el peor momento · jugada {report.worst.moveNumber}</button>}
              {report.worst && onShareIncident && <button className="secondary-btn" onClick={() => onShareIncident(report.worst, report)}>📤 Compartir</button>}
            </div>

            <details className="autopsy-full-details">
              <summary>Abrir autopsia completa</summary>
              <div className="autopsy-full-details-body">
                <p className="hint-text">La precisión estimada es una escala propia de Chess Studio basada en la pérdida media; no pretende copiar la métrica de ninguna plataforma externa.</p>

                <details className="autopsy-glossary">
              <summary>Glosario rápido · cp / CCT</summary>
              <p><b><GlossaryTerm term="cp">cp</GlossaryTerm>.</b> {CP_GLOSSARY?.definition}</p>
              <p><b><GlossaryTerm term="CCT">CCT</GlossaryTerm>.</b> {CCT_GLOSSARY?.definition}</p>
              <small>El glosario completo está en Aprendizaje → Glosario.</small>
            </details>

            {best && <div className="autopsy-best-move"><b>💎 Jugada de la partida · {best.played}</b><MoveContext move={best} /><p>{explainMoveReport(best)}</p></div>}

            {incidents.length ? <div className="autopsy-timeline">{incidents.map((m, i) => <div className={`autopsy-incident sev-${m.severity}`} key={m.index}>
              <div className="autopsy-incident-number">#{i + 1}</div>
              <div><b>{noReturn?.index === m.index ? '☠ Punto de no retorno' : incidentTitle(i, m, incidents.length)}</b><p>Jugada {m.moveNumber}: <strong>{m.played}</strong> en vez de <strong>{m.suggested}</strong> · pérdida aproximada: <strong>−{m.loss} puntos de evaluación</strong></p><MoveContext move={m} /><small>{explainMoveReport(m)}</small></div>
            </div>)}</div> : <p className="hint-text">No encontramos heridas tácticas de consideración. Francamente decepcionante para el departamento forense.</p>}

            <div className="autopsy-verdict"><b>DICTAMEN DE LA CPU</b><p>{forensicVerdict(report)}</p></div>
              </div>
            </details>
          </>}
        </>}
      </div>
    </div>
  );
}
