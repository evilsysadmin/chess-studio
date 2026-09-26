import { bestMoveOfReport, pointOfNoReturn } from './advancedCareer.js';
import { buildPostGameIncidentEvidence } from './postGameIncidentEvidence.js';

function sameMove(a, b) {
  return a && b && Number(a.index) === Number(b.index);
}

function moment(kind, label, icon, move, detail) {
  if (!move) return null;
  return { kind, label, icon, move, detail };
}

function factualWorstLabel(move) {
  const classification = buildPostGameIncidentEvidence(move)?.classification;
  const labels = {
    'missed-mate': 'Mate omitido',
    'allowed-mate': 'Mate concedido',
    'stalemate-blunder': 'Ahogado regalado',
    'tactical-punishment': 'Castigo táctico',
    'missed-tactic': 'Oportunidad táctica perdida',
  };
  return labels[classification] || 'Mayor impacto';
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
    moment('worst', factualWorstLabel(worst), '⚰', worst, worst ? `−${worst.loss} cp` : null),
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


export function terseMatthiasInsight(report, outcome) {
  if (!report?.analyzedCount) return null;
  const worst = report.worst || null;
  const incident = buildPostGameIncidentEvidence(worst);
  const classification = incident?.classification;

  if (classification === 'stalemate-blunder') return { text: 'No necesitabas dar jaque. Necesitabas dejarme una casilla.', action: 'review' };
  if (classification === 'missed-mate') return { text: 'Había mate. Elegiste otra cosa.', action: 'review' };
  if (classification === 'allowed-mate') return { text: 'Una jugada convirtió la posición en mate.', action: 'review' };

  const averageLoss = Number(report.averageLoss);
  const blunderCount = (report.moveReports || []).filter((row) => row?.severity === 'blunder' || Number(row?.loss) >= 150).length;
  if (outcome === 'win' && blunderCount >= 2) {
    return { text: 'Ganaste. Pero hubo errores graves que otro rival cobrará.', action: 'review' };
  }
  if (outcome === 'loss' && Number.isFinite(averageLoss) && averageLoss <= 35 && blunderCount === 0) {
    return { text: 'Jugaste mejor de lo que dice el resultado.', action: 'rematch' };
  }
  if (Number.isFinite(averageLoss) && averageLoss <= 25 && blunderCount === 0) {
    return { text: 'Eso sí es reproducible. Juega así otra vez.', action: 'rematch' };
  }
  return null;
}
