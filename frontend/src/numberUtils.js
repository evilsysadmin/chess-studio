export function finiteNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
export function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
