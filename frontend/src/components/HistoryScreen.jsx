import { useEscapeToClose } from '../useEscapeToClose.js';
import { gameModeLabel } from '../gameModes.js';
import { useMemo, useState } from 'react';

const OUTCOME_LABEL = { win: 'Victoria', draw: 'Tablas', loss: 'Derrota' };

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
  const [outcomeFilter, setOutcomeFilter] = useState('all');
  const [modeFilter, setModeFilter] = useState('all');
  const modes = useMemo(() => [...new Set(records.map((record) => gameModeLabel(record)))].sort(), [records]);
  const visibleRecords = useMemo(() => records.filter((record) => (
    (outcomeFilter === 'all' || record.outcome === outcomeFilter)
    && (modeFilter === 'all' || gameModeLabel(record) === modeFilter)
  )), [records, outcomeFilter, modeFilter]);
  return (
    <div className="menu tournament-panel">
      <button className="back-link" onClick={onExit}>{backLabel}</button>

      <div className="menu-section">
        <h2>{title}</h2>
        {records.length === 0 ? (
          <p className="hint-text">
            {emptyText || 'Todavía no jugaste ninguna partida. Torneo, Partida rápida y Partida de práctica quedan todas acá, con "pista inversa" para revisar dónde te equivocaste.'}
          </p>
        ) : (
          <p className="hint-text friendly-lead">Toca una partida para abrirla. Resultado, modo y fecha quedan a simple vista.</p>
        )}
      </div>

      {records.length > 0 && (
        <div className="history-filters" aria-label="Filtrar historial">
          <label>Resultado<select value={outcomeFilter} onChange={(event) => setOutcomeFilter(event.target.value)}><option value="all">Todos</option><option value="win">Victorias</option><option value="draw">Tablas</option><option value="loss">Derrotas</option></select></label>
          <label>Modo<select value={modeFilter} onChange={(event) => setModeFilter(event.target.value)}><option value="all">Todos</option>{modes.map((mode) => <option key={mode} value={mode}>{mode}</option>)}</select></label>
          <span>{visibleRecords.length} de {records.length}</span>
        </div>
      )}

      {records.length > 0 && visibleRecords.length === 0 && <div className="ui-state ui-state-empty"><b>No hay partidas con esos filtros</b><span>Prueba otra combinación.</span></div>}

      {visibleRecords.length > 0 && (
        <div className="history-list">
          {visibleRecords.map((r) => {
            const moveCount = (r.moves || r.log || []).length;
            return (
              <div key={r.id} className="history-row-wrap">
                <button className="history-row" onClick={() => onOpen(r)}>
                  <span className={`history-outcome ${r.outcome}`}>{OUTCOME_LABEL[r.outcome] || r.outcome}</span>
                  <span className="history-mode-tag">{gameModeLabel(r)}</span>
                  <span className="history-meta">CPU nivel {r.difficulty} · {moveCount} jugadas{r.opening?.name ? ` · ${r.opening.name}` : ''}{r.timeControl?.label ? ` · ${r.timeControl.label}` : ''}</span>
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
        <details className="friendly-disclosure history-options">
          <summary>Opciones del historial</summary>
          <div className="friendly-disclosure-body danger-action-zone">
            <div><b>Borrar todo el historial</b><small>Eliminará la lista de partidas guardadas. Esta acción no se puede deshacer.</small></div>
            <button className="danger-btn" onClick={onClear}>Borrar historial</button>
          </div>
        </details>
      )}
    </div>
  );
}
