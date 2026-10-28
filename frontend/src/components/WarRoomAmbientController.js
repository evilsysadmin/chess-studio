import { getEffectiveReducedMotion, USER_PREFERENCES_CHANGED_EVENT } from '../userPreferences.js';
import { createWarRoomAmbientScheduler } from './WarRoomAmbientScheduler.js';
import { warRoomAmbientFramePlan } from './WarRoom3DAnimation.js';

// Own the slow atmospheric heartbeat and its visibility listeners outside the
// already-large Board3DCore. Never own game state or the explicit move paints.
export function createWarRoomAmbientController({
  host,
  canvas,
  coarsePointer = false,
  softwareRenderer = false,
  hansDiagnosticsRequested = false,
  narrativeActive = () => false,
  onPaint,
  reducedMotion = getEffectiveReducedMotion,
  win = window,
  doc = document,
  now = () => performance.now(),
} = {}) {
  if (softwareRenderer && !hansDiagnosticsRequested) return null;

  let intersecting = true;
  const scheduler = createWarRoomAmbientScheduler({
    requestFrame: (callback) => win.requestAnimationFrame(callback),
    cancelFrame: (id) => win.cancelAnimationFrame(id),
    setTimer: (callback, delay) => win.setTimeout(callback, delay),
    clearTimer: (id) => win.clearTimeout(id),
    now,
    planFrame: (elapsedMs) => warRoomAmbientFramePlan({
      documentHidden: doc.hidden,
      intersecting,
      reducedMotion: reducedMotion(),
      coarsePointer,
      softwareRenderer,
      narrativeActive: Boolean(narrativeActive()),
      elapsedMs,
    }),
    onFrame: onPaint,
  });

  const wake = () => scheduler.wake();
  const onInteraction = () => scheduler.markInteraction();
  // Visibility returning to foreground is a meaningful wake signal after
  // deep sleep: wake() alone would keep the old 30s idle timestamp and refuse
  // every new ambient frame until the next pointer event.
  const onVisibilityChange = () => {
    if (doc.hidden) wake();
    else onInteraction();
  };
  const query = win.matchMedia?.('(prefers-reduced-motion: reduce)') || null;
  canvas.dataset.warRoomAmbientScheduler = 'deadline-v1';
  canvas.addEventListener('warroom-hans-call-release', wake);
  // Input is a wake signal, not a request to redraw on every pointer event.
  // In particular, a quiet board can stop rendering without going inert.
  canvas.addEventListener('pointermove', onInteraction, { passive: true });
  canvas.addEventListener('pointerdown', onInteraction, { passive: true });
  canvas.addEventListener('wheel', onInteraction, { passive: true });
  canvas.addEventListener('keydown', onInteraction);
  doc.addEventListener('visibilitychange', onVisibilityChange);
  win.addEventListener(USER_PREFERENCES_CHANGED_EVENT, wake);
  query?.addEventListener?.('change', wake);

  // Only ambient paints sleep offscreen. Initial/explicit state paints and
  // chess clocks continue to use their own authoritative paths.
  let visibilityObserver = null;
  if (typeof win.IntersectionObserver === 'function') {
    visibilityObserver = new win.IntersectionObserver(([entry]) => {
      if (!entry) return;
      const next = Boolean(entry.isIntersecting);
      if (intersecting === next) return;
      intersecting = next;
      if (intersecting && !doc.hidden) onInteraction();
      else wake();
    });
    visibilityObserver.observe(host);
  }

  return {
    start: scheduler.start,
    wake,
    markPaint: scheduler.markPaint,
    getDebugState: scheduler.getDebugState,
    dispose: () => {
      visibilityObserver?.disconnect();
      canvas.removeEventListener('warroom-hans-call-release', wake);
      canvas.removeEventListener('pointermove', onInteraction);
      canvas.removeEventListener('pointerdown', onInteraction);
      canvas.removeEventListener('wheel', onInteraction);
      canvas.removeEventListener('keydown', onInteraction);
      doc.removeEventListener('visibilitychange', onVisibilityChange);
      win.removeEventListener(USER_PREFERENCES_CHANGED_EVENT, wake);
      query?.removeEventListener?.('change', wake);
      scheduler.dispose();
    },
  };
}
