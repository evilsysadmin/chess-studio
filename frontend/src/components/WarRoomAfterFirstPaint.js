export function scheduleWarRoomAfterFirstPaint(task, scheduler = {}) {
  if (typeof task !== 'function') return () => {};

  const host = typeof globalThis !== 'undefined' ? globalThis : {};
  const requestFrame = scheduler.requestFrame || host.requestAnimationFrame?.bind(host);
  const cancelFrame = scheduler.cancelFrame || host.cancelAnimationFrame?.bind(host);
  const requestIdle = scheduler.requestIdle || host.requestIdleCallback?.bind(host);
  const cancelIdle = scheduler.cancelIdle || host.cancelIdleCallback?.bind(host);
  const setTimer = scheduler.setTimer || ((callback) => setTimeout(callback, 0));
  const clearTimer = scheduler.clearTimer || ((id) => clearTimeout(id));
  let cancelled = false;
  let frameId = 0;
  let idleId = 0;
  let timerId = 0;

  const run = () => {
    if (!cancelled) task();
  };
  const afterPaint = () => {
    if (cancelled) return;
    if (requestIdle) idleId = requestIdle(run, { timeout: 220 });
    else timerId = setTimer(run, 0);
  };

  if (requestFrame) frameId = requestFrame(afterPaint);
  else timerId = setTimer(afterPaint, 0);

  return () => {
    cancelled = true;
    if (frameId && cancelFrame) cancelFrame(frameId);
    if (idleId && cancelIdle) cancelIdle(idleId);
    if (timerId) clearTimer(timerId);
  };
}
