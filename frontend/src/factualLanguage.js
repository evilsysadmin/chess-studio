// Copy shared by evidence-backed surfaces. These phrases deliberately avoid
// turning an engine result or a small sample into a stronger factual claim.
export const REPLAY_OK_VERDICT = '✓ Sin pérdida apreciable en este análisis — buena jugada.';
export const COMBAT_REPLAY_OK_VERDICT = `${REPLAY_OK_VERDICT} El resultado del dado se evalúa aparte.`;

export const FACTUAL_LANGUAGE_FORBIDDEN_ABSOLUTES = Object.freeze([
  'no había nada mejor',
  'única jugada buena',
  'única jugada correcta',
  'mejora demostrada',
]);

export function containsFactualLanguageAbsolute(text) {
  const normalized = String(text || '').trim().toLocaleLowerCase('es');
  return FACTUAL_LANGUAGE_FORBIDDEN_ABSOLUTES.some((phrase) => normalized.includes(phrase));
}

function trainingDebtCopy(pattern) {
  const debt = pattern?.debt;
  if (!debt) return null;
  if (debt.paid) return `✓ Entrenamiento completado · últimos ${debt.target}: ${debt.progress}/${debt.target} limpios · falta observar nuevas partidas`;
  return `Deuda activa · últimos ${debt.target}: ${debt.progress}/${debt.target} limpios`;
}

export function patternProgressCopy(pattern) {
  switch (pattern?.improvementState) {
    case 'still-occurring':
      return 'Sigue ocurriendo · reapareció después de entrenarlo y aún no hay muestra limpia suficiente.';
    case 'probable-improvement':
      return 'Mejora probable · varias autopsias completas recientes sin repetir este patrón.';
    case 'corrected-with-sufficient-sample':
      return '✓ Corregido con muestra suficiente · entrenamiento completado y una racha sostenida sin recurrencia.';
    default:
      return trainingDebtCopy(pattern);
  }
}
