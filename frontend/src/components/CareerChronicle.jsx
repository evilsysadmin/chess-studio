import { useState } from 'react';
import { historicalCareerRecord } from '../careerHonors.js';
import './CareerChronicle.css';

// The seasons already come from personalSeasons.js; this view only projects them.
export default function CareerChronicle({ seasons = [], history = [], onOpenRecord }) {
  const rows = Array.isArray(seasons) ? seasons.filter((s) => Number.isInteger(s?.number)) : [];
  const [selectedNumber, setSelectedNumber] = useState(null);
  const current = rows.find((s) => s.number === selectedNumber) || rows.at(-1);
  if (!current) return null;

  const canReport = Number(current.games) > 0;
  const bestRecord = historicalCareerRecord(current.bestWin, history);
  const fraction = Number(current.target) > 0 ? Math.min(100, Math.max(0, Number(current.games) / Number(current.target) * 100)) : 0;
  const startTime = Date.parse(current.startedAt || '');
  const endTime = Date.parse(current.endedAt || '');
  const fmt = (time) => new Intl.DateTimeFormat('es-ES', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(time);
  const dates = Number.isFinite(startTime) && Number.isFinite(endTime)
    ? (fmt(startTime) === fmt(endTime) ? fmt(endTime) : fmt(startTime) + ' — ' + fmt(endTime))
    : null;

  return (
    <section className="menu-section career-chronicle" aria-labelledby="career-chronicle-title" data-career-chronicle="v1">
      <header className="career-chronicle-heading">
        <div>
          <span className="section-label">Crónica de tu carrera</span>
          <h2 id="career-chronicle-title">Tus temporadas, capítulo a capítulo</h2>
          <p className="hint-text">Ciclos de veinte partidas competitivas. Solo resultados guardados.</p>
        </div>
        {rows.length > 1 ? (
          <label className="career-chronicle-picker">
            <span>Consultar temporada</span>
            <select value={current.number} onChange={(event) => setSelectedNumber(Number(event.target.value))}>
              {[...rows].reverse().map((s) => (
                <option key={s.number} value={s.number}>Temporada {s.number} · {s.complete ? 'completa' : 'en curso'}</option>
              ))}
            </select>
          </label>
        ) : null}
      </header>
      {!canReport ? (
        <p className="career-chronicle-empty">Tu primer capítulo comienza cuando termines una partida competitiva. Todavía no hay hazañas acreditadas.</p>
      ) : (
        <div className="career-chronicle-story">
          <div className="career-chronicle-main">
            <span className="career-chronicle-chapter">Capítulo {current.number} · {current.complete ? 'completado' : 'en curso'}</span>
            <h3>{current.wins} victorias · {current.draws} tablas · {current.losses} derrotas</h3>
            <p>{current.games}/{current.target} partidas · {current.scorePct}% de puntuación{dates ? ' · ' + dates : ''}</p>
            <div className="career-chronicle-progress" role="meter" aria-label="Progreso de la temporada" aria-valuemin={0} aria-valuemax={current.target} aria-valuenow={current.games}>
              <span style={{ width: fraction + '%' }} />
            </div>
            {current.rating ? (
              <p>Rating en este ciclo: <b>{current.rating.delta >= 0 ? '+' : ''}{current.rating.delta}</b>{current.rating.exactBaseline === false ? ' · desde el primer checkpoint disponible' : ''}</p>
            ) : <p>Rating del ciclo: sin checkpoints comparables.</p>}
          </div>
          <div className="career-chronicle-evidence">
            <span className="section-label">Momentos documentados</span>
            {current.bestWin ? (
              <div className="career-chronicle-highlight">
                <strong>Victoria destacada del capítulo{Number.isFinite(Number(current.bestWin.difficulty)) && current.bestWin.difficulty != null ? ' · dificultad registrada ' + current.bestWin.difficulty : ''}</strong>
                {bestRecord && typeof onOpenRecord === 'function' ? (
                  <button type="button" onClick={() => onOpenRecord(bestRecord)}>Revisar esta partida →</button>
                ) : <small>Replay no disponible sin un registro único.</small>}
              </div>
            ) : <p>Este capítulo no registra victorias.</p>}
            {current.bestOpening ? (
              <p><b>Apertura destacada:</b> {current.bestOpening.opening} · {current.bestOpening.scorePct}% en {current.bestOpening.games} partidas</p>
            ) : <p>Faltan dos partidas con una misma apertura para destacar una.</p>}
            {current.worstBlunder ? (
              <details className="career-chronicle-autopsy">
                <summary>Consultar autopsia del capítulo</summary>
                <p>Peor pérdida registrada en partidas analizadas: ~{current.worstBlunder.loss} cp. No representa todas las partidas.</p>
              </details>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
