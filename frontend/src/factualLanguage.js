// Copy shared by evidence-backed surfaces. These phrases deliberately avoid
// turning an engine result or a small sample into a stronger factual claim.
export const REPLAY_OK_VERDICT = '✓ Sin pérdida apreciable en este análisis — buena jugada.';

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
