import { authHeader } from './auth.js';
import { APP_RELEASE } from './release.js';
import { withRequestId } from './requestId.js';
import { fetchWithTimeout } from './asyncControl.js';

const BASE_URL = String(import.meta.env?.VITE_API_URL || 'http://localhost:4000/api').replace(/\/$/, '');
const ALLOWED_VITALS = new Set(['FCP', 'LCP', 'CLS', 'TTFB', 'INP']);
const TELEMETRY_TIMEOUT_MS = 5000;
let currentContext = 'App';
let started = false;

export function setFrontendTelemetryContext(value) {
  const clean = String(value || 'App').replace(/[^A-Za-z0-9 _·-]/g, '').slice(0, 48);
  currentContext = clean || 'App';
}

export function frontendTelemetryPayload(eventType, details = {}) {
  const payload = {
    eventType,
    context: currentContext,
    release: APP_RELEASE,
  };
  if (eventType === 'web_vital' && ALLOWED_VITALS.has(details.metricName)) {
    const value = Number(details.value);
    if (Number.isFinite(value) && value >= 0) {
      payload.metricName = details.metricName;
      payload.value = Math.round(value * 1000) / 1000;
    }
  }
  if (eventType === 'frontend_error' || eventType === 'unhandled_rejection' || eventType === 'state_invariant') {
    payload.errorName = String(details.errorName || 'Error').replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 80) || 'Error';
  }
  return payload;
}

export function sendFrontendTelemetry(eventType, details = {}, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') return;
  const payload = frontendTelemetryPayload(eventType, details);
  if (eventType === 'web_vital' && (!payload.metricName || payload.value == null)) return;
  try {
    void fetchWithTimeout(fetchImpl, `${BASE_URL}/client-telemetry`, {
      method: 'POST',
      headers: withRequestId({ 'Content-Type': 'application/json', ...authHeader() }),
      body: JSON.stringify(payload),
      keepalive: true,
    }, TELEMETRY_TIMEOUT_MS).catch(() => {});
  } catch {
    // Observability must never become an application dependency.
  }
}

function errorName(value) {
  if (value && typeof value === 'object' && typeof value.name === 'string') return value.name;
  return typeof value === 'string' ? 'RejectedValue' : 'Error';
}

export function startFrontendTelemetry() {
  if (started || typeof window === 'undefined') return () => {};
  started = true;

  const onError = (event) => sendFrontendTelemetry('frontend_error', { errorName: errorName(event?.error) });
  const onRejection = (event) => sendFrontendTelemetry('unhandled_rejection', { errorName: errorName(event?.reason) });
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  const observers = [];
  const observe = (type, callback, buffered = true) => {
    if (typeof PerformanceObserver === 'undefined') return;
    try {
      const observer = new PerformanceObserver((list) => callback(list.getEntries()));
      observer.observe({ type, buffered });
      observers.push(observer);
    } catch {
      // Browser does not support that entry type.
    }
  };

  const fcp = globalThis.performance?.getEntriesByName?.('first-contentful-paint')?.[0];
  if (fcp?.startTime != null) sendFrontendTelemetry('web_vital', { metricName: 'FCP', value: fcp.startTime });
  const nav = globalThis.performance?.getEntriesByType?.('navigation')?.[0];
  if (nav?.responseStart != null) sendFrontendTelemetry('web_vital', { metricName: 'TTFB', value: nav.responseStart });

  let lcp = null;
  let cls = 0;
  let inp = null;
  observe('largest-contentful-paint', (entries) => { lcp = entries.at(-1)?.startTime ?? lcp; });
  observe('layout-shift', (entries) => {
    for (const entry of entries) if (!entry.hadRecentInput) cls += Number(entry.value || 0);
  });
  observe('event', (entries) => {
    for (const entry of entries) inp = Math.max(Number(inp || 0), Number(entry.duration || 0));
  });

  let flushed = false;
  const flushVitals = () => {
    if (flushed) return;
    flushed = true;
    if (lcp != null) sendFrontendTelemetry('web_vital', { metricName: 'LCP', value: lcp });
    sendFrontendTelemetry('web_vital', { metricName: 'CLS', value: cls });
    if (inp != null) sendFrontendTelemetry('web_vital', { metricName: 'INP', value: inp });
  };
  const onVisibility = () => { if (document.visibilityState === 'hidden') flushVitals(); };
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    flushVitals();
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    document.removeEventListener('visibilitychange', onVisibility);
    observers.forEach((observer) => observer.disconnect());
    started = false;
  };
}
