export const OBSERVABILITY_AUTO_REFRESH_OPTIONS = Object.freeze([
  { value: 30000, label: '30 s' },
  { value: 60000, label: '1 min' },
  { value: 120000, label: '2 min' },
  { value: 300000, label: '5 min' },
  { value: 900000, label: '15 min' },
]);

export const DEFAULT_OBSERVABILITY_AUTO_REFRESH_MS = 60000;

export function isObservabilityAutoRefreshInterval(value) {
  return OBSERVABILITY_AUTO_REFRESH_OPTIONS.some((option) => option.value === Number(value));
}
