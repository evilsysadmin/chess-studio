import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { analyzeGame } from '../gameReport.js';
import { useEscapeToClose } from '../useEscapeToClose.js';

function incidentTitle(index, mistake, total) {
  if (index === 0 && mistake.loss >= 300) return 'Hora aproximada del fallecimiento';
  if (index === 0) return 'Punto de inflexión';
  if (index === total - 1) return 'Daños colaterales';
  return 'Segundo impacto';
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

export default function GameReportModal({ history, humanColor, onClose, onOpenCrimeScene }) {
  useEscapeToClose(onClose);
  const [status, setStatus] = useState('loading'); // 'loading' | 'done' | 'error'
  const [report, setReport] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await analyzeGame(history, humanColor, api);
        if (!cancelled) {
          setReport(result);
          setStatus('done');
        }
      } catch (e) {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [history, humanColor]);

  const incidents = report?.topMistakes?.filter((m) => m.loss > 15) || [];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="army-card game-autopsy" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <button className="piece-info-close" onClick={onClose} aria-label="Cerrar">×</button>
        <p className="eyebrow">Medicina legal ajedrecística</p>
        <h3>Autopsia de la partida</h3>

        {status === 'loading' && (
          <p className="hint-text">
            Comparando tus jugadas contra el motor y localizando el momento exacto en que la posición empezó a pedir un sacerdote…
          </p>
        )}

        {status === 'error' && (
          <p className="hint-text import-error">
            No se pudo generar la autopsia. El forense probablemente no encuentra el backend.
          </p>
        )}

        {status === 'done' && report && (
          <>
            {report.analyzedCount === 0 ? (
              <p className="hint-text">No hubo suficientes jugadas propias para analizar.</p>
            ) : (
              <>
                <div className="autopsy-summary">
                  <div><span>Precisión</span><b>{report.label}</b></div>
                  <div><span>Pérdida media</span><b>−{report.averageLoss} cp</b></div>
                  <div><span>Jugadas revisadas</span><b>{report.analyzedCount}</b></div>
                </div>

                {incidents.length ? (
                  <div className="autopsy-timeline">
                    {incidents.map((m, i) => (
                      <div className={`autopsy-incident sev-${m.severity}`} key={m.index}>
                        <div className="autopsy-incident-number">#{i + 1}</div>
                        <div>
                          <b>{incidentTitle(i, m, incidents.length)}</b>
                          <p>
                            Jugada {m.moveNumber}: <strong>{m.played}</strong> en vez de <strong>{m.suggested}</strong>
                            {' '}· pérdida aproximada: <strong>−{m.loss} cp</strong>
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="hint-text">No encontramos heridas tácticas de consideración. Francamente decepcionante para el departamento forense.</p>
                )}

                <div className="autopsy-verdict">
                  <b>DICTAMEN DE LA CPU</b>
                  <p>{forensicVerdict(report)}</p>
                </div>

                {report.worst && report.worst.loss > 15 && onOpenCrimeScene && (
                  <button className="primary-btn crime-scene-btn" onClick={() => onOpenCrimeScene(report.worst, report)}>
                    🎥 Ver el crimen · jugada {report.worst.moveNumber}
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
