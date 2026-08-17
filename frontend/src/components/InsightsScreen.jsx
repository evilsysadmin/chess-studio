import React, { useMemo, useRef, useState } from 'react';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { api } from '../api.js';
import { findWorstMoveEver } from '../gameReport.js';
import { generateRoast } from '../insights.js';
import { formatLongMove } from '../notation.js';
import { loadUnlocked, ACHIEVEMENTS } from '../achievements.js';
import { loadPuzzlesSolved } from '../puzzleStats.js';
import { loadWorstMoveCache, saveWorstMoveCache } from '../worstMoveCache.js';
import RatingChart from './RatingChart.jsx';

const MODE_LABEL = { tournament: 'Torneo', practice: 'Práctica', casual: 'Partida rápida', combat: 'Combate' };

function WinBar({ stats }) {
  if (!stats || stats.total === 0) return null;
  const winPct = (stats.wins / stats.total) * 100;
  const drawPct = (stats.draws / stats.total) * 100;
  return (
    <div className="insights-winbar">
      <div className="insights-winbar-track">
        <span className="insights-winbar-win" style={{ width: `${winPct}%` }} />
        <span className="insights-winbar-draw" style={{ width: `${drawPct}%`, left: `${winPct}%` }} />
      </div>
      <span className="insights-winbar-label">{stats.wins}V · {stats.draws}T · {stats.losses}D</span>
    </div>
  );
}

export default function InsightsScreen({ insights, gameHistory, combatHistory, ratingHistory, onExit, onJumpToMove }) {
  useEscapeToClose(onExit);

  const [searchStatus, setSearchStatus] = useState('idle'); // 'idle' | 'running' | 'done'
  const [searchProgress, setSearchProgress] = useState({ done: 0, total: 0 });
  const [searchResult, setSearchResult] = useState(null);
  const stopRef = useRef(false);

  // Se recalcula si cambian los insights o si aparece un resultado nuevo
  // de "Buscar mi peor jugada de siempre" — sin volver a llamar al
  // backend, todo esto ya está calculado.
  const roastExtras = useMemo(() => ({
    achievementsUnlocked: loadUnlocked().size,
    achievementsTotal: ACHIEVEMENTS.length,
    puzzlesSolved: loadPuzzlesSolved(),
  }), []);
  const roastLines = useMemo(() => generateRoast(insights, searchResult, roastExtras), [insights, searchResult, roastExtras]);

  async function startSearch() {
    stopRef.current = false;
    setSearchStatus('running');
    setSearchResult(null);
    setSearchProgress({ done: 0, total: gameHistory.length + combatHistory.length });

    // Partidas ya analizadas en una búsqueda anterior no vuelven a
    // llamar al backend — una partida terminada nunca cambia, así que su
    // resultado sigue siendo válido para siempre. El caché se guarda
    // (local + sincronizado a Mongo vía el perfil) aunque la búsqueda se
    // cancele a mitad de camino, para no perder el trabajo ya hecho.
    const cache = loadWorstMoveCache();
    const { best, cache: updatedCache } = await findWorstMoveEver(
      gameHistory,
      combatHistory,
      api,
      (done, total, best) => {
        setSearchProgress({ done, total });
        if (best) setSearchResult(best); // resultado parcial, se ve mientras sigue buscando
      },
      () => stopRef.current,
      { cache }
    );

    saveWorstMoveCache(updatedCache);
    setSearchResult(best);
    setSearchStatus('done');
  }

  function cancelSearch() {
    stopRef.current = true;
  }

  if (insights.totalGames === 0) {
    return (
      <div className="menu tournament-panel">
        <button className="back-link" onClick={onExit}>← Volver al menú</button>
        <div className="menu-section">
          <h2>Así juegas</h2>
          <p className="hint-text">
            Todavía no hay ninguna partida guardada — juega alguna (en el modo que sea) y esto se va a ir
            llenando solo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="menu tournament-panel">
      <button className="back-link" onClick={onExit}>← Volver al menú</button>

      <div className="menu-section">
        <span className="section-label">Estadísticas agregadas</span>
        <h2>Así juegas</h2>
        <p className="hero-scope-note">
          Todo lo de abajo se calcula al instante con lo que ya está guardado — no vuelve a analizar cada
          partida contra el motor (eso tardaría segundos por partida). Para eso está el botón de "peor
          jugada de siempre" más abajo: es la excepción cara, a demanda, no automática.
        </p>
      </div>

      {roastLines.length > 0 && (
        <div className="menu-section roast-section">
          <h2>Cómo te ve, sin filtro</h2>
          <ul className="roast-list">
            {roastLines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="menu-section">
        <h2>General</h2>
        <p className="hint-text">
          <b>{insights.totalGames}</b> partida{insights.totalGames === 1 ? '' : 's'} en total ·{' '}
          <b>{insights.overall.winPct}%</b> de victorias
        </p>
        <WinBar stats={insights.overall} />
      </div>

      {Object.keys(insights.byMode).length > 1 && (
        <div className="menu-section">
          <h2>Por modo</h2>
          <div className="insights-mode-list">
            {Object.entries(insights.byMode).map(([mode, stats]) => (
              <div className="insights-mode-row" key={mode}>
                <span className="insights-mode-name">{MODE_LABEL[mode] || mode}</span>
                <WinBar stats={stats} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="menu-section">
        <h2>Datos sueltos</h2>
        <div className="insights-facts-grid">
          {insights.favoriteOpening && (
            <div className="insights-fact">
              <span className="insights-fact-value">{insights.favoriteOpening.name}</span>
              <span className="insights-fact-label">Tu apertura más jugada ({insights.favoriteOpening.count}×)</span>
            </div>
          )}
          <div className="insights-fact">
            <span className="insights-fact-value">
              {insights.colorPreference.white} / {insights.colorPreference.black}
            </span>
            <span className="insights-fact-label">Partidas con blancas / negras</span>
          </div>
          <div className="insights-fact">
            <span className="insights-fact-value">{insights.longestWinStreak}</span>
            <span className="insights-fact-label">Racha de victorias más larga</span>
          </div>
          <div className="insights-fact">
            <span className="insights-fact-value">{insights.humanCaptures}</span>
            <span className="insights-fact-label">Piezas capturadas por ti (en todos los modos)</span>
          </div>
          {insights.ratingTrend && (
            <div className="insights-fact">
              <span className="insights-fact-value">
                {insights.ratingTrend.delta >= 0 ? '+' : ''}{insights.ratingTrend.delta}
              </span>
              <span className="insights-fact-label">
                Cambio de rating desde el primer registro ({insights.ratingTrend.min}–{insights.ratingTrend.max})
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="menu-section">
        <h2>Tu peor jugada de siempre</h2>
        <p className="hint-text" style={{ marginBottom: '0.7rem' }}>
          Recorre TODO tu historial (hasta {gameHistory.length + combatHistory.length} partidas), analizando
          cada una contra el motor — a diferencia de todo lo de arriba, esto sí es caro. Corre de a una
          partida por vez para no saturar el backend, así que puede tardar un rato; puedes cancelar en
          cualquier momento y te queda lo que encontró hasta ahí.
        </p>

        {searchStatus === 'idle' && (
          <button type="button" className="secondary-btn" onClick={startSearch}>
            Buscar mi peor jugada de siempre
          </button>
        )}

        {searchStatus === 'running' && (
          <div className="insights-search-progress">
            <div className="status-chip-bar">
              <span
                className="status-chip-bar-fill"
                style={{ width: `${searchProgress.total ? (searchProgress.done / searchProgress.total) * 100 : 0}%` }}
              />
            </div>
            <p className="hint-text">
              Analizando partida {searchProgress.done} de {searchProgress.total}…
              {searchResult && ` Peor encontrada hasta ahora: ${searchResult.moveReport.played} (-${searchResult.moveReport.loss}).`}
            </p>
            <button type="button" className="secondary-btn" onClick={cancelSearch}>Cancelar</button>
          </div>
        )}

        {searchStatus === 'done' && searchResult && (
          <div className={`worst-move-card sev-${searchResult.moveReport.severity}`} style={{ cursor: 'default' }}>
            <span className="worst-move-header">
              <span className="worst-move-san">
                {formatLongMove({
                  piece: searchResult.moveReport.playedPiece,
                  from: searchResult.moveReport.playedFrom,
                  to: searchResult.moveReport.playedTo,
                })}
              </span>
              <span className="worst-move-loss">-{searchResult.moveReport.loss}</span>
            </span>
            <span className="worst-move-detail">
              El motor prefería{' '}
              {formatLongMove({
                piece: searchResult.moveReport.suggestedPiece,
                from: searchResult.moveReport.suggestedFrom,
                to: searchResult.moveReport.suggestedTo,
              })}
              {' · '}{new Date(searchResult.record.date).toLocaleDateString('es-ES')}
              {' · '}{MODE_LABEL[searchResult.kind === 'combat' ? 'combat' : (searchResult.record.mode || 'tournament')]}
            </span>
            {onJumpToMove && (
              <button
                type="button"
                className="secondary-btn"
                style={{ marginTop: '0.5rem' }}
                onClick={() => onJumpToMove(searchResult.record, searchResult.kind, searchResult.moveReport)}
              >
                Ver esta jugada →
              </button>
            )}
          </div>
        )}

        {searchStatus === 'done' && !searchResult && (
          <p className="hint-text">No se encontró ninguna jugada con pérdida real en todo el historial — juegas bastante limpio.</p>
        )}
      </div>

      {ratingHistory.length >= 2 && (
        <div className="menu-section">
          <h2>Evolución del rating</h2>
          <RatingChart history={ratingHistory} />
        </div>
      )}
    </div>
  );
}
