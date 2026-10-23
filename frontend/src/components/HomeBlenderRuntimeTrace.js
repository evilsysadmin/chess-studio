// Tiny, bounded, page-local forensic history. Remains on <html> even when a
// Blender canvas is replaced by the safety scene. Never transmitted, persisted
// or populated with GPU fingerprints, URLs, errors or user data.
export const HOME_BLENDER_TRACE_LIMIT = 10;
const EVENTS = new Set(['mount', 'ready', 'lod-lite', 'context-lost', 'context-restored', 'fallback']);
const REASONS = new Set([
  'policy-ineligible', 'webgl-constructor', 'model-unavailable',
  'model-timeout', 'adaptive-2d',
]);

export function recordHomeBlenderRuntimeEvent(event, {
  reason = null,
  root = typeof document === 'undefined' ? null : document.documentElement,
  at = Date.now(),
} = {}) {
  if (!EVENTS.has(event) || !root?.dataset) return null;
  let previous = [];
  try {
    const parsed = JSON.parse(root.dataset.homeBlenderTrace || '[]');
    if (Array.isArray(parsed)) previous = parsed.filter((entry) =>
      entry && EVENTS.has(entry.event) && Number.isFinite(entry.at)
    ).slice(1 - HOME_BLENDER_TRACE_LIMIT).map((entry) => {
      // Existing page metadata is not a trusted schema: never carry through
      // arbitrary keys, URLs or overlong strings into the bounded forensic log.
      const clean = { event: entry.event, at: Math.floor(entry.at) };
      if (entry.event === 'fallback') {
        clean.reason = REASONS.has(entry.reason) ? entry.reason : 'unknown';
      }
      return clean;
    });
  } catch {
    // Corrupt diagnostic metadata must never break the scene or fallback.
  }
  const entry = { event, at: Number.isFinite(at) ? Math.floor(at) : Date.now() };
  if (event === 'fallback') entry.reason = REASONS.has(reason) ? reason : 'unknown';
  const history = [...previous, entry].slice(-HOME_BLENDER_TRACE_LIMIT);
  root.dataset.homeBlenderTrace = JSON.stringify(history);
  root.dataset.homeBlenderLastEvent = event;
  return entry;
}
