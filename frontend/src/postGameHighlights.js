import { bestMoveOfReport, pointOfNoReturn } from './advancedCareer.js';

function sameMove(a, b) {
  return a && b && Number(a.index) === Number(b.index);
}

function moment(kind, label, icon, move, detail) {
  if (!move) return null;
  return { kind, label, icon, move, detail };
}

// Resumen deliberadamente pequeño: como máximo tres momentos distintos.
// El análisis completo sigue disponible a demanda desde la autopsia.
export function keyGameMoments(report) {
  if (!report?.analyzedCount) return [];

  const best = bestMoveOfReport(report);
  const turningPoint = pointOfNoReturn(report);
  const worst = report.worst || null;
  const candidates = [
    moment('best', 'Mejor decisión', '💎', best, best ? `Pérdida ${best.loss} cp` : null),
    moment('turning', 'Punto de inflexión', '☠', turningPoint, turningPoint ? `−${turningPoint.loss} cp` : null),
    moment('worst', 'Mayor impacto', '⚰', worst, worst ? `−${worst.loss} cp` : null),
  ].filter(Boolean);

  const unique = [];
  for (const candidate of candidates) {
    if (!unique.some((item) => sameMove(item.move, candidate.move))) unique.push(candidate);
  }

  if (unique.length < 3) {
    for (const move of report.topMistakes || []) {
      if (!move || unique.some((item) => sameMove(item.move, move))) continue;
      unique.push(moment('review', 'Para revisar', '🔎', move, `−${move.loss} cp`));
      if (unique.length === 3) break;
    }
  }

  return unique.slice(0, 3);
}
