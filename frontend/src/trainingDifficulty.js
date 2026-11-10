// Training from a stored position should preserve the real CPU strength,
// including level 0. Unknown/corrupt legacy values use the lab default.
export function resolveTrainingDifficulty(value) {
  if (value === null || value === undefined || typeof value === 'boolean'
    || String(value).trim() === '') return 50;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 100 ? number : 50;
}
