// The 30-second loading watchdog is for a *cold* Home that never composed 3D.
// A scene that has already displayed a genuine WebGL frame can later lose its
// context; abandoning that canvas destroys its chance to restore. A painted
// preview is sufficient while waiting for the browser's recovery event.
export function home3DColdStartWatchdogShouldFallback({
  currentlyVisible = false,
  everPresented3D = false,
} = {}) {
  return !currentlyVisible && !everPresented3D;
}
