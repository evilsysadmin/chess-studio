// React dialogue overlays must not poll the entire War Room at display FPS.
// The Three.js runtime already publishes its phase and anchor as canvas
// attributes; observe those exact changes instead of spinning a second rAF.
export const WAR_ROOM_HANS_DIALOGUE_ATTRIBUTES = Object.freeze([
  'data-war-room-hans-mop-dialogue',
  'data-war-room-hans-service-dialogue',
  'data-war-room-hans-screen',
  'data-war-room-hans-ndc-x',
  'data-war-room-hans-ndc-y',
]);

export function observeWarRoomHansDialogue({
  host,
  onChange,
  watchUiClasses = false,
  Observer = typeof MutationObserver === 'undefined' ? null : MutationObserver,
  setTimer = (callback, delay) => setTimeout(callback, delay),
  clearTimer = (id) => clearTimeout(id),
} = {}) {
  if (!host || typeof onChange !== 'function') return () => {};
  let disposed = false;
  let timerId = null;
  const sync = () => {
    if (!disposed) onChange(host.querySelector?.('.board3d-main-canvas') || null);
  };
  // Start with actual current state even if the canvas was already populated.
  sync();
  if (typeof Observer === 'function') {
    const observer = new Observer(sync);
    observer.observe(host, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: WAR_ROOM_HANS_DIALOGUE_ATTRIBUTES,
    });
    // Service speech is suppressed in Focus/Zen. A parent CSS class can
    // change without a new WebGL frame, so watch only those two ancestor
    // class attributes rather than polling the whole page.
    if (watchUiClasses) {
      for (const selector of ['.game-layout-3d', '.board-live-row']) {
        const parent = host.closest?.(selector);
        if (parent && parent !== host) {
          observer.observe(parent, { attributes: true, attributeFilter: ['class'] });
        }
      }
    }
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }

  // Compatibility fallback for browsers without MutationObserver: a slow,
  // disposable timer is enough for speech; never fall back to 60 FPS polling.
  const tick = () => {
    timerId = null;
    if (disposed) return;
    sync();
    timerId = setTimer(tick, 500);
  };
  timerId = setTimer(tick, 500);
  return () => {
    disposed = true;
    if (timerId !== null) clearTimer(timerId);
    timerId = null;
  };
}
