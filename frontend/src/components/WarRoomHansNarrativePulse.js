// This loop orchestrates *dialogue*, not 3D animation. Polling at the display
// refresh rate burns CPU and forces layouts even while Hans awaits a response.
export const WAR_ROOM_HANS_NARRATIVE_POLL_MS = 80;

export function createWarRoomHansNarrativePulse({
  onTick,
  now,
  setTimer,
  clearTimer,
  isHidden = () => false,
  intervalMs = WAR_ROOM_HANS_NARRATIVE_POLL_MS,
} = {}) {
  let timerId = null;
  let stopped = false;
  let finished = false;

  const cancel = () => {
    if (timerId !== null) clearTimer?.(timerId);
    timerId = null;
  };

  const schedule = (delay) => {
    if (stopped || finished || isHidden() || timerId !== null) return;
    timerId = setTimer?.(run, delay) ?? null;
  };

  function run() {
    timerId = null;
    if (stopped || finished || isHidden()) return;
    if (onTick?.(now?.()) === false) {
      finished = true;
      return;
    }
    schedule(intervalMs);
  }

  return {
    start: () => schedule(0),
    onVisibilityChange: () => {
      if (isHidden()) cancel();
      else schedule(0);
    },
    dispose: () => {
      stopped = true;
      cancel();
    },
  };
}
