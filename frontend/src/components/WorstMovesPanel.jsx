import { formatLongMove } from '../notation.js';

export const SEVERITY_LABEL = {
  ok: 'Buena jugada',
  inaccuracy: 'Imprecisión',
  mistake: 'Error',
  blunder: 'Error grave',
};

// Resumen de "a dónde ir primero" sin tener que bucear jugada por jugada en
// el cuaderno completo — las hasta 3 peores decisiones, ya calculadas por
// analyzeGame/analyzeCombatLog (report.topMistakes), con un salto directo a
// cada una.
export default function WorstMovesPanel({ report, onJump }) {
  if (!report) return null;

  // topMistakes trae "las 3 peores", pero si la partida no tuvo 3 errores
  // de verdad, rellena con jugadas buenas (severidad 'ok') para completar el
  // cupo — mostrar una "Buena jugada" dentro de un panel de "Peores
  // jugadas" sería confuso, así que se filtran acá antes de renderizar.
  const realMistakes = report.topMistakes.filter((m) => m.severity !== 'ok' && m.severity !== 'unrated');

  if (realMistakes.length === 0) {
    if (report.analyzedCount === 0) return null; // nada analizado todavía, no hay nada que resumir
    return <p className="hint-text worst-moves-clean">No hubo errores destacables — jugaste bastante limpio.</p>;
  }

  return (
    <div className="worst-moves-panel">
      <h3>Peores jugadas</h3>
      {realMistakes.map((m) => (
        <button
          type="button"
          key={m.index}
          className={`worst-move-card sev-${m.severity}`}
          onClick={() => onJump(m.index + 1)}
        >
          <span className="worst-move-header">
            <span className="worst-move-san">{formatLongMove({ piece: m.playedPiece, from: m.playedFrom, to: m.playedTo })}</span>
            <span className="worst-move-loss">-{m.loss}</span>
          </span>
          <span className="worst-move-detail">
            {SEVERITY_LABEL[m.severity]} — mejor era{' '}
            {formatLongMove({ piece: m.suggestedPiece, from: m.suggestedFrom, to: m.suggestedTo })}
          </span>
        </button>
      ))}
    </div>
  );
}
