import React from 'react';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { combatRecordModeLabel } from '../combatChessBrand.js';

const OUTCOME_LABEL = { win: 'Victoria', draw: 'Tablas', loss: 'Derrota' };
const MODE_LABEL = { tournament: 'Torneo', practice: 'Práctica', casual: 'Partida rápida', ghost: 'Rival Fantasma', combat: 'Combate', lab: 'Laboratorio', rescue: 'Salvar cadáver', boss: 'Boss Run', streak: 'Racha' };

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export default function HistoryScreen({ records, onOpen, onShare, onMovie, onExit, onClear, title = 'Historial de partidas', emptyText, backLabel = '← Volver' }) {
  useEscapeToClose(onExit);
  return (
    <div className="menu tournament-panel">
      <button className="back-link" onClick={onExit}>{backLabel}</button>

      <div className="menu-section">
        <h2>{title}</h2>
        {records.length === 0 ? (
          <p className="hint-text">
            {emptyText || 'Todavía no jugaste ninguna partida. Torneo, Partida rápida y Práctica quedan todas acá, con "pista inversa" para revisar dónde te equivocaste.'}
          </p>
        ) : (
          <p className="hint-text">Toca una partida para reproducirla jugada por jugada, con análisis incluido.</p>
        )}
      </div>

      {records.length > 0 && (
        <div className="history-list">
          {records.map((r) => {
            const moveCount = (r.moves || r.log || []).length;
            return (
              <div key={r.id} className="history-row-wrap">
                <button className="history-row" onClick={() => onOpen(r)}>
                  <span className={`history-outcome ${r.outcome}`}>{OUTCOME_LABEL[r.outcome] || r.outcome}</span>
                  <span className="history-mode-tag">{combatRecordModeLabel(r) || MODE_LABEL[r.mode] || (r.log ? 'Combate' : 'Torneo')}</span>
                  <span className="history-meta">CPU nivel {r.difficulty} · {moveCount} jugadas{r.timeControl?.label ? ` · ${r.timeControl.label}` : ''}</span>
                  <span className="history-date">{formatDate(r.date)}</span>
                </button>
                <div className="history-side-actions">
                  {onMovie && !r.log && (
                    <button className="history-share-btn" onClick={() => onMovie(r)} aria-label="Ver película de la partida">Película</button>
                  )}
                  {onShare && !r.log && (
                    <button className="history-share-btn" onClick={() => onShare(r)} aria-label="Compartir partida">Compartir</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {records.length > 0 && (
        <button className="secondary-btn" style={{ width: '100%', marginTop: '0.9rem' }} onClick={onClear}>
          Borrar historial
        </button>
      )}
    </div>
  );
}
