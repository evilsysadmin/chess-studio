import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { analyzeGame } from '../gameReport.js';
import { useEscapeToClose } from '../useEscapeToClose.js';

export default function GameReportModal({ history, humanColor, onClose }) {
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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="army-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <button className="piece-info-close" onClick={onClose} aria-label="Cerrar">×</button>
        <h3>Informe de la partida</h3>

        {status === 'loading' && (
          <p className="hint-text">
            Comparando tus jugadas contra lo que el motor hubiera preferido en cada momento… puede tardar unos
            segundos.
          </p>
        )}

        {status === 'error' && (
          <p className="hint-text import-error">
            No se pudo generar el informe (¿está corriendo el backend?). Intenta de nuevo más tarde.
          </p>
        )}

        {status === 'done' && report && (
          <>
            {report.analyzedCount === 0 ? (
              <p className="hint-text">No hubo suficientes jugadas propias para analizar.</p>
            ) : (
              <>
                <p className="report-label">{report.label}</p>
                <p className="hint-text" style={{ marginBottom: '1rem' }}>
                  Se revisaron {report.analyzedCount} de tus jugadas · pérdida promedio de evaluación:{' '}
                  <b>{report.averageLoss}</b>
                </p>

                {report.worst && report.worst.loss > 15 && (
                  <div className="menu-section">
                    <h2>Tu jugada más floja</h2>
                    <p className="hint-text">
                      En la jugada {report.worst.moveNumber} jugaste <b>{report.worst.played}</b>, el motor
                      prefería <b>{report.worst.suggested}</b> — ahí perdiste más evaluación que en cualquier
                      otro momento.
                    </p>
                  </div>
                )}

                {report.topMistakes.filter((m) => m.loss > 15).length > 1 && (
                  <div className="menu-section">
                    <h2>Para revisar</h2>
                    <ul className="report-mistake-list">
                      {report.topMistakes.filter((m) => m.loss > 15).map((m, i) => (
                        <li key={i}>
                          Jugada {m.moveNumber}: <b>{m.played}</b> en vez de <b>{m.suggested}</b> (−{m.loss})
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
