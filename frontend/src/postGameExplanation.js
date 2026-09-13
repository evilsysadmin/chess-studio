import { explainMoveReport } from './advancedCareer.js';

function safeMove(value, fallback) {
  const text = String(value || '').trim();
  return text || fallback;
}

export function buildPlainPostGameExplanation(position) {
  if (!position) return [];
  const played = safeMove(position.played, 'una jugada distinta');
  const suggested = safeMove(position.suggested, 'la alternativa del análisis');
  const loss = Math.max(0, Math.round(Number(position.loss) || 0));
  const context = explainMoveReport(position);

  const lines = [
    `En esa posición jugaste ${played}; el análisis prefería ${suggested}${loss ? `, con una diferencia aproximada de ${loss} cp` : ''}.`,
  ];
  if (context) lines.push(context);
  else lines.push('La diferencia viene de la posición concreta tras esa jugada; no es una etiqueta genérica ni una valoración inventada.');
  return lines.slice(0, 3);
}
