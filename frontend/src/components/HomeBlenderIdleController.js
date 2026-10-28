export const HOME_BLENDER_IDLE_SLEEP_MS = 30_000;

// One deadline for the whole hall. Input updates its timestamp without
// replacing timers, and deep idle leaves neither RAF polling nor a wake timer.
export function createHomeBlenderIdleController({
  host,
  onSleep,
  onWake,
  win = window,
  now = () => performance.now(),
} = {}) {
  let enabled = false;
  let disposed = false;
  let sleeping = false;
  let timer = null;
  let lastActivityAt = 0;

  const cancel = () => {
    if (timer !== null) win.clearTimeout(timer);
    timer = null;
  };
  const arm = () => {
    if (timer !== null || !enabled || disposed || sleeping) return;
    const remaining = HOME_BLENDER_IDLE_SLEEP_MS - (now() - lastActivityAt);
    timer = win.setTimeout(check, Math.max(0, remaining));
  };
  function check() {
    timer = null;
    if (!enabled || disposed) return;
    if (now() - lastActivityAt < HOME_BLENDER_IDLE_SLEEP_MS) {
      arm();
      return;
    }
    sleeping = true;
    onSleep?.();
  }
  const activity = () => {
    if (!enabled || disposed) return;
    lastActivityAt = now();
    const wasSleeping = sleeping;
    sleeping = false;
    arm();
    if (wasSleeping) onWake?.();
  };
  const events = ['pointermove', 'pointerdown', 'wheel', 'keydown', 'focusin'];
  for (const event of events) host?.addEventListener(event, activity, { passive: true });

  return {
    get sleeping() { return sleeping; },
    setEnabled(next) {
      if (disposed || enabled === Boolean(next)) return;
      enabled = Boolean(next);
      sleeping = false;
      cancel();
      if (enabled) {
        lastActivityAt = now();
        arm();
      }
    },
    dispose() {
      disposed = true;
      enabled = false;
      cancel();
      for (const event of events) host?.removeEventListener(event, activity);
    },
  };
}
