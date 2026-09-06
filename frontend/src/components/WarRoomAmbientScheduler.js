const FAST_RAF_INTERVAL_MS = 34;
const DUE_EPSILON_MS = 1;

function numericNow(now) {
  const value = Number(now?.());
  return Number.isFinite(value) ? value : 0;
}

/**
 * Schedules the War Room's slow ambient heartbeat by deadline instead of
 * polling requestAnimationFrame at the display refresh rate.
 *
 * Idle fire/light animation normally runs at ~10 FPS. A timer sleeps until the
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

    if (plan.active && plan.shouldRender) {
      onFrame?.(frameNow, plan);
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

    const intervalMs = Math.max(0, Number(plan.intervalMs) || 0);
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
    lastPaintAt = Number.isFinite(value) ? value : numericNow(now);
  };

  const dispose = () => {
    disposed = true;
    cancelPending();
  };

  return {
    start,
    wake,
    markPaint,
    dispose,
    getDebugState: () => ({
      disposed,
      rafPending: Boolean(rafId),
      timerPending: Boolean(timerId),
      lastPaintAt,
    }),
  };
}
