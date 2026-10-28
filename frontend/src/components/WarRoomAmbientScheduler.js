const FAST_RAF_INTERVAL_MS = 34;
const DUE_EPSILON_MS = 1;
// After a prolonged truly quiet period, preserve live fire/light but avoid
// paying the full ambient GPU budget until gameplay paints again.
const SETTLED_IDLE_AFTER_MS = 12_000;
const SETTLED_IDLE_INTERVAL_FACTOR = 2;
// A motionless board should not keep repainting hundreds of 3D objects.
const DEEP_SLEEP_AFTER_MS = 30_000;

function numericNow(now) {
  const value = Number(now?.());
  return Number.isFinite(value) ? value : 0;
}

/**
 * Schedules the War Room's slow ambient heartbeat by deadline instead of
 * polling requestAnimationFrame at the display refresh rate.
 *
 * Idle fire/light animation starts at ~10 FPS, then halves its cadence after
 * 12 seconds without a non-ambient paint. A timer sleeps until the
 * next paint is actually due and a single RAF aligns that paint with the
 * browser. Fast interactive camera work keeps RAF cadence while it is dirty.
 */
export function createWarRoomAmbientScheduler({
  requestFrame,
  cancelFrame,
  setTimer,
  clearTimer,
  now,
  planFrame,
  onFrame,
} = {}) {
  let disposed = false;
  let rafId = 0;
  let timerId = 0;
  let lastPaintAt = numericNow(now);
  let lastNonAmbientPaintAt = lastPaintAt;
  let paintingAmbient = false;

  const cancelPending = () => {
    if (rafId) cancelFrame?.(rafId);
    if (timerId) clearTimer?.(timerId);
    rafId = 0;
    timerId = 0;
  };

  const runFrame = (timestamp) => {
    rafId = 0;
    if (disposed) return;
    const frameNow = Number.isFinite(Number(timestamp)) ? Number(timestamp) : numericNow(now);
    const elapsedMs = Math.max(0, frameNow - lastPaintAt);
    const plan = planFrame?.(elapsedMs) || {};

    const deepIdle = !plan.keepAmbientAwake && frameNow - lastNonAmbientPaintAt >= DEEP_SLEEP_AFTER_MS;
    if (plan.active && plan.shouldRender && !deepIdle) {
      paintingAmbient = true;
      try {
        onFrame?.(frameNow, plan);
      } finally {
        paintingAmbient = false;
      }
      // Budget from completion, not from callback entry: a slow WebGL paint
      // must not cause the scheduler to immediately demand another frame.
      lastPaintAt = numericNow(now);
    }
    scheduleNext();
  };

  const requestRaf = () => {
    timerId = 0;
    if (disposed || rafId) return;
    rafId = requestFrame?.(runFrame) || 0;
  };

  function scheduleNext() {
    if (disposed) return;
    const current = numericNow(now);
    const elapsedMs = Math.max(0, current - lastPaintAt);
    const plan = planFrame?.(elapsedMs) || {};
    if (!plan.active) return;
    // Beyond 30 seconds with no gameplay/hover/keyboard interaction, no
    // timers and no WebGL ambient submissions remain. Explicit state paints
    // and user interaction can wake the scheduler instantly.
    if (!plan.keepAmbientAwake && current - lastNonAmbientPaintAt >= DEEP_SLEEP_AFTER_MS) return;

    const normalIntervalMs = Math.max(0, Number(plan.intervalMs) || 0);
    // Only slow the heartbeat, never the fast inspect-camera/animation path.
    // Ambient's own renderNow() calls markPaint(), but must not count as input.
    const settled = !plan.keepAmbientAwake && current - lastNonAmbientPaintAt >= SETTLED_IDLE_AFTER_MS;
    const intervalMs = settled && normalIntervalMs > FAST_RAF_INTERVAL_MS
      ? normalIntervalMs * SETTLED_IDLE_INTERVAL_FACTOR
      : normalIntervalMs;
    const remainingMs = Math.max(0, intervalMs - elapsedMs);

    // Inspect-camera movement is deliberately fast and short-lived. RAF is
    // appropriate there; the expensive bug was using RAF polling for the
    // always-on 100 ms idle heartbeat.
    if (intervalMs <= FAST_RAF_INTERVAL_MS || remainingMs <= DUE_EPSILON_MS) {
      requestRaf();
      return;
    }

    timerId = setTimer?.(requestRaf, remainingMs) || 0;
  }

  const start = () => {
    if (disposed) return;
    cancelPending();
    scheduleNext();
  };

  const wake = () => {
    if (disposed) return;
    // Used by visibility/reduced-motion changes and dirty inspect-camera input.
    // Re-evaluate the deadline rather than forcing an unnecessary paint.
    cancelPending();
    scheduleNext();
  };

  const markPaint = (timestamp = numericNow(now)) => {
    const value = Number(timestamp);
    const paintAt = Number.isFinite(value) ? value : numericNow(now);
    lastPaintAt = paintAt;
    if (paintingAmbient) return;
    const wasSettled = paintAt - lastNonAmbientPaintAt >= SETTLED_IDLE_AFTER_MS;
    lastNonAmbientPaintAt = paintAt;
    // A real gameplay/camera/React paint restores ordinary ambience at once.
    // Do not reschedule every frame of a piece movement.
    if (wasSettled && !disposed) wake();
  };

  const markInteraction = (timestamp = numericNow(now), forceWake = false) => {
    const value = Number(timestamp);
    const at = Number.isFinite(value) ? value : numericNow(now);
    // Resume the ordinary ambient deadline on the first real interaction
    // after *either* quiet tier. Otherwise a 200/300ms idle timer survives
    // pointer activity until it fires, even though the user is active again.
    const wasSettled = at - lastNonAmbientPaintAt >= SETTLED_IDLE_AFTER_MS;
    lastNonAmbientPaintAt = at;
    // Returning from a hidden tab/offscreen viewport must restart the
    // scheduler even if its last input was only a few milliseconds ago:
    // the hidden state had cancelled every pending deadline.
    if ((wasSettled || forceWake) && !disposed) wake();
  };

  const dispose = () => {
    disposed = true;
    cancelPending();
  };

  return {
    start,
    wake,
    markPaint,
    markInteraction,
    dispose,
    getDebugState: () => {
      // The profiler must describe the scheduler's *actual* decision, not
      // merely a quiet timestamp. During a Hans narrative, ambience keeps
      // painting past 30s, while a hidden/offscreen surface is inactive.
      const current = numericNow(now);
      const plan = disposed ? {} : (planFrame?.(Math.max(0, current - lastPaintAt)) || {});
      const active = Boolean(plan.active);
      const narrativeAwake = Boolean(plan.keepAmbientAwake);
      return {
        disposed,
        rafPending: Boolean(rafId),
        timerPending: Boolean(timerId),
        lastPaintAt,
        lastNonAmbientPaintAt,
        inactive: !active,
        narrativeAwake,
        deepSleeping: !disposed && active && !narrativeAwake
          && current - lastNonAmbientPaintAt >= DEEP_SLEEP_AFTER_MS,
      };
    },
  };
}
