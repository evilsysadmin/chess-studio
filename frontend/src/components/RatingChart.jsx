import { RATING_TIERS } from '../playerRating.js';

const WIDTH = 380;
const HEIGHT = 140;
const PAD_LEFT = 34;
const PAD_RIGHT = 10;
const PAD_TOP = 10;
const PAD_BOTTOM = 20;

export default function RatingChart({ history }) {
  if (!history || history.length < 2) {
    return (
      <p className="hint-text rating-chart-empty">
        Todavía no hay suficientes partidas para dibujar tu evolución — se va a ir completando a medida que
        juegues (arranca a contar desde ahora, no reconstruye partidas de antes de este cambio).
      </p>
    );
  }

  const ratings = history.map((p) => p.rating);
  const minRating = Math.min(...ratings);
  const maxRating = Math.max(...ratings);
  // Un margen de verdad aunque el rating no se haya movido casi nada — si
  // no, una racha plana se dibujaría como una línea recta pegada al borde.
  const span = Math.max(maxRating - minRating, 40);
  const yMin = minRating - span * 0.15;
  const yMax = maxRating + span * 0.15;

  const plotW = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;

  function x(i) {
    return PAD_LEFT + (i / (history.length - 1)) * plotW;
  }
  function y(rating) {
    return PAD_TOP + plotH - ((rating - yMin) / (yMax - yMin)) * plotH;
  }

  const linePoints = history.map((p, i) => `${x(i)},${y(p.rating)}`).join(' ');
  const areaPoints = `${x(0)},${PAD_TOP + plotH} ${linePoints} ${x(history.length - 1)},${PAD_TOP + plotH}`;

  // Líneas de referencia de las categorías (Principiante/Aficionado/...)
  // que caen dentro del rango visible — el mismo "eco" del bronce/plata/oro
  // que ya usa el resto de la app, acá como contexto de fondo.
  const visibleTierLines = RATING_TIERS.filter((t) => t.min > yMin && t.min < yMax && t.min > 0);

  const first = history[0];
  const last = history[history.length - 1];
  const delta = last.rating - first.rating;

  return (
    <div className="rating-chart">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="rating-chart-svg">
        {visibleTierLines.map((t) => (
          <g key={t.label}>
            <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={y(t.min)} y2={y(t.min)} className="rating-chart-tier-line" />
            <text x={PAD_LEFT} y={y(t.min) - 3} className="rating-chart-tier-label">{t.label}</text>
          </g>
        ))}

        <polygon points={areaPoints} className="rating-chart-area" />
        <polyline points={linePoints} className="rating-chart-line" />

        {history.map((p, i) => (
          <circle key={p.date + i} cx={x(i)} cy={y(p.rating)} r={i === history.length - 1 ? 3.5 : 2} className="rating-chart-dot" />
        ))}

        <text x={PAD_LEFT} y={HEIGHT - 4} className="rating-chart-axis-label">{minRating}</text>
        <text x={WIDTH - PAD_RIGHT} y={HEIGHT - 4} textAnchor="end" className="rating-chart-axis-label">{maxRating}</text>
      </svg>
      <p className="hint-text rating-chart-caption">
        {history.length} partida{history.length === 1 ? '' : 's'} registrada{history.length === 1 ? '' : 's'}
        {' · '}
        {delta === 0 ? 'sin cambios' : delta > 0 ? `+${delta} desde el primer registro` : `${delta} desde el primer registro`}
      </p>
    </div>
  );
}
