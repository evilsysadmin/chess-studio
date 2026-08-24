export const OBSERVABILITY_LATENCY_VIEWS = Object.freeze(['p50', 'p95', 'p99', 'all']);

export function isObservabilityLatencyView(value) {
  return OBSERVABILITY_LATENCY_VIEWS.includes(value);
}

export function observabilityLatencyTitle(prefix, view) {
  const safeView = isObservabilityLatencyView(view) ? view : 'p95';
  return `${prefix} · ${safeView === 'all' ? 'p50 / p95 / p99' : safeView}`;
}
